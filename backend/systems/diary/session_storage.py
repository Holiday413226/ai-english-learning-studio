"""JSON file persistence for Diary entries and streak tracking.

Data file: data/diary/entries.json
"""

import json
import os
import threading
from pathlib import Path
from datetime import date, datetime, timedelta, timezone

from core.paths import get_data_root


class DiarySessionStorage:
    """Thread-safe JSON storage for diary entries with streak computation."""

    def __init__(self, data_dir: str = None):
        if data_dir is None:
            data_dir = get_data_root()
        self._system_dir = Path(data_dir) / "diary"
        self._system_dir.mkdir(parents=True, exist_ok=True)
        self._entries_file = self._system_dir / "entries.json"
        self._lock = threading.Lock()

    # ── Public API ─────────────────────────────────────────────────

    def save_entry(self, entry_data: dict) -> dict:
        """Save a diary entry. Overwrites existing entry for the same date.

        Args:
            entry_data: dict with keys: date, original, corrections, score,
                        highlighted_expressions.

        Returns:
            The saved entry dict (with created_at added).
        """
        data = self._read_all()
        entry_date = entry_data.get("date", "").strip()

        if "created_at" not in entry_data or not entry_data.get("created_at"):
            entry_data["created_at"] = datetime.now(timezone.utc).isoformat()

        # Overwrite existing entry for the same date
        data["entries"] = [
            e for e in data["entries"]
            if e.get("date", "").strip() != entry_date
        ]
        data["entries"].append(entry_data)

        # Keep entries sorted by date descending
        data["entries"].sort(key=lambda e: e.get("date", ""), reverse=True)

        self._write_all(data)
        return entry_data

    def get_entries(self, from_date: str = None, to_date: str = None) -> list[dict]:
        """Get diary entries, optionally filtered by date range.

        Args:
            from_date: ISO date string (inclusive).
            to_date: ISO date string (inclusive).

        Returns:
            List of entry dicts sorted by date descending.
        """
        data = self._read_all()
        entries = data["entries"]

        if from_date:
            entries = [e for e in entries if e.get("date", "") >= from_date]
        if to_date:
            entries = [e for e in entries if e.get("date", "") <= to_date]

        return entries

    def compute_streak(self) -> dict:
        """Compute the current consecutive-day streak.

        The streak counts backwards from today (or yesterday) as long as
        each consecutive prior day has an entry.

        Returns:
            dict: {current_streak: int, streak_dates: [str]}
        """
        data = self._read_all()
        entries = data.get("entries", [])

        if not entries:
            return {"current_streak": 0, "streak_dates": []}

        # Build set of dates that have entries
        entry_dates = set()
        for e in entries:
            d = e.get("date", "").strip()
            if d:
                entry_dates.add(d)

        # Walk backwards from today
        today = date.today()
        streak_dates = []

        # Check today first, then yesterday, etc.
        cursor = today
        while True:
            cursor_str = cursor.isoformat()
            if cursor_str in entry_dates:
                streak_dates.append(cursor_str)
                cursor = cursor - timedelta(days=1)
            else:
                # If today has no entry, check if yesterday does (streak can
                # be counted through yesterday if user hasn't written today yet)
                if cursor == today:
                    cursor = cursor - timedelta(days=1)
                    if cursor.isoformat() in entry_dates:
                        continue
                break

        # Check if the streak is continuous from the dates we collected
        if not streak_dates:
            return {"current_streak": 0, "streak_dates": []}

        # Build the continuous streak starting from the most recent date
        streak_dates.sort(reverse=True)
        continuous = [streak_dates[0]]
        for i in range(1, len(streak_dates)):
            prev_date = date.fromisoformat(continuous[-1])
            curr_date = date.fromisoformat(streak_dates[i])
            if prev_date - curr_date == timedelta(days=1):
                continuous.append(streak_dates[i])
            else:
                break  # gap — streak ends

        return {
            "current_streak": len(continuous),
            "streak_dates": continuous,
        }

    # ── Internal I/O ───────────────────────────────────────────────

    def _read_all(self) -> dict:
        with self._lock:
            if not self._entries_file.exists():
                return {"version": 1, "entries": []}
            try:
                with open(self._entries_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                return {"version": 1, "entries": []}

    def _write_all(self, data: dict) -> None:
        tmp = self._entries_file.with_suffix(".tmp")
        with self._lock:
            try:
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                os.replace(str(tmp), str(self._entries_file))
            finally:
                if tmp.exists():
                    try:
                        tmp.unlink()
                    except OSError:
                        pass


# Module-level singleton
diary_storage = DiarySessionStorage()
