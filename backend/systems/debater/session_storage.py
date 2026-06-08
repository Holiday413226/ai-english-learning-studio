"""JSON file session storage for the Debater subsystem.

Each session is stored as data/debater/session_<id>.json.
Conversation history persists across server restarts.
"""

import json
import os
import time
import uuid
import threading
from pathlib import Path


class DebaterSessionStorage:
    """Thread-safe JSON file persistence for Debater chat sessions."""

    MAX_SESSIONS = 50
    MAX_MESSAGES = 100

    def __init__(self, data_dir: str = None):
        if data_dir is None:
            data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data")
        self._system_dir = Path(data_dir) / "debater"
        self._system_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def _session_path(self, session_id: str) -> Path:
        return self._system_dir / f"session_{session_id}.json"

    def create(self, mode: str = "debate", bot_id: str = "") -> str:
        """Create a new empty session and return its ID."""
        sid = str(uuid.uuid4())
        now = time.time()
        data = {
            "session_id": sid,
            "mode": mode,
            "bot_id": bot_id,
            "conversation_id": None,
            "messages": [],
            "created_at": now,
            "updated_at": now,
        }
        self._write(sid, data)
        self._trim()
        return sid

    def get_or_create(self, session_id: str, mode: str = "debate", bot_id: str = "") -> str:
        """Return existing session_id or create a new one."""
        if session_id:
            existing = self.load(session_id)
            if existing is not None:
                return session_id
        return self.create(mode=mode, bot_id=bot_id)

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

    def add_messages(self, session_id: str, messages: list[dict]) -> bool:
        """Append messages to a session and persist. Returns False if not found."""
        session = self.load(session_id)
        if session is None:
            return False
        now = time.time()
        for msg in messages:
            msg.setdefault("timestamp", now)
        session.setdefault("messages", []).extend(messages)
        if len(session["messages"]) > self.MAX_MESSAGES:
            session["messages"] = session["messages"][-self.MAX_MESSAGES:]
        self.save(session_id, session)
        return True

    def set_conversation_id(self, session_id: str, conversation_id: str) -> None:
        """Update the COZE conversation_id for multi-turn continuity."""
        session = self.load(session_id)
        if session:
            session["conversation_id"] = conversation_id
            self.save(session_id, session)

    def get_conversation_id(self, session_id: str) -> str | None:
        """Return the stored COZE conversation_id or None."""
        session = self.load(session_id)
        return session.get("conversation_id") if session else None

    def is_full(self, session_id: str) -> bool:
        """Check if a session has hit the message cap."""
        session = self.load(session_id)
        return len(session.get("messages", [])) >= self.MAX_MESSAGES if session else False

    def list_all(self) -> list[dict]:
        """Return metadata for all sessions (no messages)."""
        result = []
        for f in sorted(self._system_dir.glob("session_*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
            try:
                with open(f, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                preview = "New Chat"
                for m in data.get("messages", []):
                    if m.get("role") == "user":
                        preview = m["content"][:60]
                        break
                result.append({
                    "session_id": data.get("session_id", f.stem.replace("session_", "")),
                    "mode": data.get("mode", "debate"),
                    "message_count": len(data.get("messages", [])),
                    "created_at": data.get("created_at", 0),
                    "updated_at": data.get("updated_at", 0),
                    "preview": preview,
                })
            except (json.JSONDecodeError, IOError):
                pass
        return result

    def get_full(self, session_id: str) -> dict | None:
        """Return full session dict including messages, or None."""
        session = self.load(session_id)
        if session is None:
            return None
        return {
            "session_id": session.get("session_id", session_id),
            "mode": session.get("mode", "debate"),
            "messages": session.get("messages", []),
            "created_at": session.get("created_at", 0),
            "updated_at": session.get("updated_at", 0),
        }

    def delete(self, session_id: str) -> bool:
        """Delete a session file. Returns True if it existed."""
        path = self._session_path(session_id)
        if path.exists():
            path.unlink()
            return True
        return False

    def _write(self, session_id: str, data: dict) -> None:
        """Atomic write to disk."""
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

    def _trim(self):
        """Remove oldest sessions if over the limit."""
        files = sorted(self._system_dir.glob("session_*.json"), key=lambda p: p.stat().st_ctime)
        excess = len(files) - self.MAX_SESSIONS
        for f in files[:excess]:
            try:
                f.unlink()
            except OSError:
                pass


# Module-level singleton
debater_storage = DebaterSessionStorage()
