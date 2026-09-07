"""JSON file session storage for the Minecraft subsystem.

Each session is stored as data/minecraft/session_<id>.json.
Conversation history persists across server restarts.

Bot status is stored at data/minecraft/bot_status.json — writable by the
Minebot process and readable by the companion panel endpoints.
"""

import json
import os
import time
import uuid
import threading
from pathlib import Path

from core.paths import get_data_root


class MinecraftSessionStorage:
    """Thread-safe JSON file persistence for Minecraft chat sessions."""

    MAX_SESSIONS = 50
    MAX_MESSAGES = 100

    def __init__(self, data_dir: str = None):
        if data_dir is None:
            data_dir = get_data_root()
        self._system_dir = Path(data_dir) / "minecraft"
        self._system_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._bot_status_file = self._system_dir / "bot_status.json"

    def _session_path(self, session_id: str) -> Path:
        return self._system_dir / f"session_{session_id}.json"

    def create(self, bot_id: str = "") -> str:
        """Create a new empty session and return its ID."""
        sid = str(uuid.uuid4())
        now = time.time()
        data = {
            "session_id": sid,
            "bot_id": bot_id,
            "conversation_id": None,
            "messages": [],
            "created_at": now,
            "updated_at": now,
        }
        self._write(sid, data)
        self._trim()
        return sid

    def get_or_create(self, session_id: str, bot_id: str = "") -> str:
        """Return existing session_id or create a new one."""
        if session_id:
            existing = self.load(session_id)
            if existing is not None:
                return session_id
        return self.create(bot_id=bot_id)

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

    # ── Bot Status ───────────────────────────────────────────────────

    def get_bot_status(self) -> dict:
        """Return bot online status from the bot_status.json file.

        Returns:
            {
                bot_online: bool,
                bot_name: str,
                last_seen: str | None,
                session_count: int,
            }
        If the file doesn't exist (Minebot hasn't written it), returns
        offline defaults.
        """
        default = {
            "bot_online": False,
            "bot_name": "",
            "last_seen": None,
            "session_count": len(list(self._system_dir.glob("session_*.json"))),
        }
        if not self._bot_status_file.exists():
            return default
        try:
            with open(self._bot_status_file, "r", encoding="utf-8") as f:
                stored = json.load(f)
        except (json.JSONDecodeError, IOError):
            return default

        return {
            "bot_online": stored.get("status") == "online",
            "bot_name": stored.get("bot_name", ""),
            "last_seen": stored.get("last_seen"),
            "session_count": len(list(self._system_dir.glob("session_*.json"))),
        }

    def set_bot_offline(self) -> None:
        """Mark the bot as offline (called when we detect it's not running)."""
        data = {"status": "offline", "bot_name": "", "last_seen": None}
        if self._bot_status_file.exists():
            try:
                with open(self._bot_status_file, "r", encoding="utf-8") as f:
                    existing = json.load(f)
                data["bot_name"] = existing.get("bot_name", "")
                data["last_seen"] = existing.get("last_seen")
            except (json.JSONDecodeError, IOError):
                pass
        self._write_bot_status(data)

    def scan_sessions(self) -> int:
        """Scan the data directory for session files and return count.

        This mimics what a refresh trigger does — it re-reads whatever
        the Minebot process has written to disk. The existing session
        files are already on disk, so this is primarily a validation
        that the caller passes.
        """
        files = list(self._system_dir.glob("session_*.json"))
        return len(files)

    def _write_bot_status(self, data: dict) -> None:
        """Atomic write for bot_status.json."""
        tmp = self._bot_status_file.with_suffix(".tmp")
        with self._lock:
            try:
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                os.replace(str(tmp), str(self._bot_status_file))
            finally:
                if tmp.exists():
                    try:
                        tmp.unlink()
                    except OSError:
                        pass

    # ── Internal helpers ─────────────────────────────────────────────

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
minecraft_storage = MinecraftSessionStorage()
