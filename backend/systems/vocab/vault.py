"""Vocabulary vault — JSON file storage + SM-2 spaced repetition.

Data file: data/vocab/vault.json
"""

import json
import os
import time
import threading
import random
from pathlib import Path
from datetime import datetime, timezone


class VocabVault:
    """Thread-safe vocabulary storage with SM-2 spaced repetition."""

    MAX_WORDS = 2000

    def __init__(self, data_dir: str = None):
        if data_dir is None:
            data_dir = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "..", "..", "data"
            )
        self._system_dir = Path(data_dir) / "vocab"
        self._system_dir.mkdir(parents=True, exist_ok=True)
        self._vault_file = self._system_dir / "vault.json"
        self._lock = threading.Lock()

    # ── Public API ─────────────────────────────────────────────────

    def add_word(self, word: str, source_module: str, source_context: str = "",
                 definition_en: str = "", definition_zh: str = "",
                 phonetic: str = "", example_sentence: str = "") -> dict:
        """Add a word to the vault. Idempotent — if word exists, returns existing."""
        data = self._read_all()
        key = word.lower().strip()

        if key in data["words"]:
            return data["words"][key]

        # Enforce max
        if len(data["words"]) >= self.MAX_WORDS:
            oldest = min(data["words"].keys(),
                        key=lambda k: data["words"][k].get("created_at", ""))
            del data["words"][oldest]

        now = datetime.now(timezone.utc).isoformat()
        entry = {
            "word": word.strip(),
            "phonetic": phonetic,
            "definition_en": definition_en,
            "definition_zh": definition_zh,
            "example_sentence": example_sentence or source_context,
            "source_module": source_module,
            "source_context": source_context,
            "created_at": now,
            "review_count": 0,
            "last_reviewed": None,
            "next_review": now,
            "easiness_factor": 2.5,
        }
        data["words"][key] = entry
        self._write_all(data)
        return entry

    def get_word(self, word: str) -> dict | None:
        """Get a single word entry, or None."""
        data = self._read_all()
        return data["words"].get(word.lower().strip())

    def list_words(self, sort_by: str = "created_at", order: str = "desc",
                   limit: int = None, module_filter: str = None) -> list[dict]:
        """List all words with optional filtering and sorting."""
        data = self._read_all()
        words = list(data["words"].values())

        if module_filter:
            words = [w for w in words if w.get("source_module") == module_filter]

        reverse = order == "desc"
        words.sort(key=lambda w: w.get(sort_by, ""), reverse=reverse)

        if limit:
            words = words[:limit]

        return words

    def delete_word(self, word: str) -> bool:
        """Delete a word from the vault. Returns True if it existed."""
        data = self._read_all()
        key = word.lower().strip()
        if key in data["words"]:
            del data["words"][key]
            self._write_all(data)
            return True
        return False

    # ── SM-2 Spaced Repetition ─────────────────────────────────────

    def review_word(self, word: str, quality: int) -> dict:
        """Record a review and update SM-2 scheduling."""
        data = self._read_all()
        key = word.lower().strip()
        if key not in data["words"]:
            raise KeyError(f"Word '{word}' not in vault")

        entry = data["words"][key]
        ef = entry.get("easiness_factor", 2.5)

        # SM-2 core algorithm
        if quality >= 3:
            if entry["review_count"] == 0:
                interval = 1
            elif entry["review_count"] == 1:
                interval = 6
            else:
                interval = max(1, entry.get("_interval", 1) * ef)
            entry["review_count"] += 1
        else:
            interval = 1
            entry["review_count"] = 0

        ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        ef = max(1.3, ef)
        entry["easiness_factor"] = round(ef, 2)
        entry["_interval"] = interval

        now = datetime.now(timezone.utc)
        next_review_time = now.timestamp() + interval * 86400
        entry["last_reviewed"] = now.isoformat()
        entry["next_review"] = datetime.fromtimestamp(
            next_review_time, tz=timezone.utc
        ).isoformat()

        data["words"][key] = entry
        self._write_all(data)

        return {
            "next_review": entry["next_review"],
            "easiness_factor": entry["easiness_factor"],
            "review_count": entry["review_count"],
        }

    def words_due_for_review(self, limit: int = 20) -> list[dict]:
        """Return words whose next_review date has passed."""
        now = datetime.now(timezone.utc).isoformat()
        data = self._read_all()
        due = [w for w in data["words"].values() if w.get("next_review", "") <= now]
        due.sort(key=lambda w: w.get("next_review", ""))
        return due[:limit]

    # ── Quiz Generation ────────────────────────────────────────────

    def generate_quiz(self, count: int = 10) -> list[dict]:
        """Generate a multiple-choice quiz."""
        data = self._read_all()
        all_words = list(data["words"].values())
        if len(all_words) < 2:
            return []

        due = self.words_due_for_review(limit=count)
        test_words = due[:count]
        if len(test_words) < count:
            remaining = [w for w in all_words if w not in test_words]
            random.shuffle(remaining)
            test_words.extend(remaining[:count - len(test_words)])
        test_words = test_words[:count]

        questions = []
        for word_entry in test_words:
            correct_def = word_entry.get("definition_zh") or word_entry.get("definition_en") or "(no definition)"
            other_words = [w for w in all_words
                          if w["word"].lower() != word_entry["word"].lower()]
            if len(other_words) < 3:
                continue
            distractors = random.sample(other_words, 3)
            distractor_defs = [
                d.get("definition_zh") or d.get("definition_en") or "(no definition)"
                for d in distractors
            ]

            options = [correct_def] + distractor_defs
            random.shuffle(options)
            correct_idx = options.index(correct_def)

            questions.append({
                "word": word_entry["word"],
                "phonetic": word_entry.get("phonetic", ""),
                "options": options,
                "correct": correct_idx,
            })

        return questions

    # ── Export ─────────────────────────────────────────────────────

    def export_csv(self) -> str:
        """Export all words as CSV string."""
        import io
        import csv
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["word", "definition_en", "definition_zh", "phonetic",
                          "example_sentence", "source_module", "created_at",
                          "review_count", "next_review"])
        data = self._read_all()
        for w in data["words"].values():
            writer.writerow([
                w.get("word", ""),
                w.get("definition_en", ""),
                w.get("definition_zh", ""),
                w.get("phonetic", ""),
                w.get("example_sentence", ""),
                w.get("source_module", ""),
                w.get("created_at", ""),
                w.get("review_count", 0),
                w.get("next_review", ""),
            ])
        return output.getvalue()

    # ── Statistics ─────────────────────────────────────────────────

    def get_stats(self) -> dict:
        """Return aggregate statistics for the Dashboard."""
        data = self._read_all()
        words = data["words"].values()
        return {
            "total": len(data["words"]),
            "by_module": {
                mod: sum(1 for w in words if w.get("source_module") == mod)
                for mod in ["novel", "diary", "debater", "minecraft"]
            },
            "due_for_review": len(self.words_due_for_review(limit=9999)),
            "average_ef": round(
                sum(w.get("easiness_factor", 2.5) for w in words) / max(len(words), 1), 2
            ),
        }

    # ── Internal I/O ───────────────────────────────────────────────

    def _read_all(self) -> dict:
        with self._lock:
            if not self._vault_file.exists():
                return {"version": 1, "words": {}}
            try:
                with open(self._vault_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                return {"version": 1, "words": {}}

    def _write_all(self, data: dict) -> None:
        tmp = self._vault_file.with_suffix(".tmp")
        with self._lock:
            try:
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                os.replace(str(tmp), str(self._vault_file))
            finally:
                if tmp.exists():
                    try:
                        tmp.unlink()
                    except OSError:
                        pass


# Module-level singleton
vocab_vault = VocabVault()
