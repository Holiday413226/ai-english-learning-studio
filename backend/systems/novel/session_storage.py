"""JSON file session storage for the Novel subsystem.

Each session is stored as data/novel/session_<id>.json.
Translation history persists across server restarts.
"""

import json
import os
import time
import uuid
import threading
from pathlib import Path


class NovelSessionStorage:
    """Thread-safe JSON file persistence for Novel translation sessions."""

    MAX_MESSAGES = 50

    def __init__(self, data_dir: str = None):
        if data_dir is None:
            data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data")
        self._system_dir = Path(data_dir) / "novel"
        self._system_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def _session_path(self, session_id: str) -> Path:
        return self._system_dir / f"session_{session_id}.json"

    def create(self) -> str:
        """Create a new empty session and return its ID."""
        sid = str(uuid.uuid4())
        now = time.time()
        data = {
            "session_id": sid,
            "messages": [],
            "created_at": now,
            "updated_at": now,
        }
        self._write(sid, data)
        return sid

    def load(self, session_id: str) -> dict | None:
        """Load a session from disk. Returns None if not found."""
        path = self._session_path(session_id)
        if not path.exists():
            return None
        try:
            with self._lock:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
        except (json.JSONDecodeError, IOError):
            return None

    def save(self, session_id: str, data: dict) -> None:
        """Persist session data to disk."""
        data["updated_at"] = time.time()
        self._write(session_id, data)

    def add_message(self, session_id: str, role: str, content: str) -> dict | None:
        """Append a message to a session and persist. Returns updated session."""
        session = self.load(session_id)
        if session is None:
            return None
        session.setdefault("messages", []).append({
            "role": role,
            "content": content,
            "timestamp": time.time(),
        })
        if len(session["messages"]) > self.MAX_MESSAGES:
            session["messages"] = session["messages"][-self.MAX_MESSAGES:]
        self.save(session_id, session)
        return session

    def list_all(self) -> list[dict]:
        """Return metadata for all sessions (no messages)."""
        result = []
        for f in sorted(self._system_dir.glob("session_*.json"), reverse=True):
            try:
                with open(f, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                result.append({
                    "session_id": data.get("session_id", f.stem.replace("session_", "")),
                    "message_count": len(data.get("messages", [])),
                    "created_at": data.get("created_at", 0),
                    "updated_at": data.get("updated_at", 0),
                })
            except (json.JSONDecodeError, IOError):
                pass
        return result

    def delete(self, session_id: str) -> bool:
        """Delete a session file. Returns True if it existed."""
        path = self._session_path(session_id)
        if path.exists():
            path.unlink()
            return True
        return False

    def _write(self, session_id: str, data: dict) -> None:
        """Atomic write: tmp file + rename."""
        path = self._session_path(session_id)
        tmp = path.with_suffix(".tmp")
        with self._lock:
            try:
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                os.replace(str(tmp), str(path))
            finally:
                if tmp.exists():
                    try:
                        tmp.unlink()
                    except OSError:
                        pass


# Module-level singleton
novel_storage = NovelSessionStorage()
