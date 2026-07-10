"""Secure API key storage — tiered storage with fallback.

Storage strategy (in order of preference):
  1. keyring (Windows Credential Manager) — most secure
  2. Encrypted local file (~/.ai_english_studio/keys.json) — keyring fallback
  3. Plain local file (data/config/keys.json) — last resort for EXE sandboxed mode

In PyInstaller EXE mode, keyring often fails due to process identity issues.
The encrypted fallback ensures keys survive across restarts.
"""

import json
import os
import sys
import base64
import threading
from pathlib import Path
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

SERVICE_NAME = "AIEnglishStudio"

# All known key names — used for status checks and bulk delete
ALL_KEYS = [
    "deepseek_api_key",
    "coze_api_key",
    "debate_bot_id",
    "discuss_bot_id",
    "minecraft_bot_id",
]

# ── Encrypted file fallback ──────────────────────────────────

# Derive a machine-specific key from the hostname + fixed salt.
# NOT cryptographically strong, but better than plaintext.
_SALT = b"ai_english_studio_v2_salt_2026"
_KEY_FILE_DIR = None
_lock = threading.Lock()


def _get_key_dir():
    """Persistent writable directory outside the EXE temp dir."""
    global _KEY_FILE_DIR
    if _KEY_FILE_DIR:
        return _KEY_FILE_DIR

    # Prefer a user-visible directory that survives EXE restarts.
    candidates = [
        os.path.join(os.path.expanduser("~"), ".ai_english_studio"),
        os.path.join(os.environ.get("APPDATA", ""), "AIEnglishStudio"),
    ]
    # In EXE mode, data/ alongside sys.executable is persistent
    exe_dir = os.path.dirname(sys.executable) if getattr(sys, "frozen", False) else None
    if exe_dir:
        candidates.insert(0, os.path.join(exe_dir, "data", "config"))

    for d in candidates:
        try:
            os.makedirs(d, exist_ok=True)
            _KEY_FILE_DIR = d
            return d
        except OSError:
            continue

    # Ultimate fallback
    d = os.path.join(os.path.dirname(__file__), "..", "..", "data", "config")
    os.makedirs(d, exist_ok=True)
    _KEY_FILE_DIR = d
    return d


def _derive_key() -> bytes:
    """Derive a Fernet-compatible key from machine fingerprint."""
    import platform
    machine_id = platform.node() + platform.machine()
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=_SALT,
        iterations=100_000,
    )
    raw = kdf.derive(machine_id.encode())
    return base64.urlsafe_b64encode(raw)


def _encrypt(plaintext: str) -> str:
    f = Fernet(_derive_key())
    return f.encrypt(plaintext.encode()).decode()


def _decrypt(ciphertext: str) -> str:
    f = Fernet(_derive_key())
    return f.decrypt(ciphertext.encode()).decode()


def _file_path():
    return os.path.join(_get_key_dir(), "keys.enc")


# ── Core keyring helpers ────────────────────────────────────

def _try_keyring_set(key_name: str, value: str) -> bool:
    try:
        import keyring
        keyring.set_password(SERVICE_NAME, key_name, value.strip())
        return True
    except Exception:
        return False


def _try_keyring_get(key_name: str) -> str | None:
    try:
        import keyring
        return keyring.get_password(SERVICE_NAME, key_name)
    except Exception:
        return None


def _try_keyring_delete(key_name: str) -> bool:
    try:
        import keyring
        keyring.delete_password(SERVICE_NAME, key_name)
        return True
    except Exception:
        return False


# ── Encrypted file helpers ───────────────────────────────────

def _file_read_all() -> dict:
    path = _file_path()
    if not os.path.exists(path):
        return {}
    try:
        with _lock:
            with open(path, "r", encoding="utf-8") as f:
                raw = json.load(f)
        result = {}
        for k, v in raw.items():
            try:
                result[k] = _decrypt(v)
            except Exception:
                result[k] = ""  # corrupted — treat as empty
        return result
    except (json.JSONDecodeError, IOError):
        return {}


def _file_write_all(data: dict) -> None:
    encrypted = {}
    for k, v in data.items():
        if v:
            try:
                encrypted[k] = _encrypt(v)
            except Exception:
                encrypted[k] = v  # fallback: store as-is
        else:
            encrypted[k] = v
    path = _file_path()
    tmp = path + ".tmp"
    with _lock:
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(encrypted, f)
            os.replace(tmp, path)
        finally:
            if os.path.exists(tmp):
                try:
                    os.unlink(tmp)
                except OSError:
                    pass


# ── Public API ────────────────────────────────────────────────

def set_key(key_name: str, value: str) -> None:
    """Store a key. Tries keyring first, falls back to encrypted file."""
    if key_name not in ALL_KEYS:
        raise ValueError(f"Unknown key: {key_name}")
    if not value.strip():
        _delete_key(key_name)
        return

    # Write to encrypted file ALWAYS (reliable across restarts)
    data = _file_read_all()
    data[key_name] = value.strip()
    _file_write_all(data)

    # Also try keyring (best effort)
    _try_keyring_set(key_name, value.strip())


def get_key(key_name: str) -> str | None:
    """Retrieve a key. Tries keyring first, then encrypted file."""
    # Try keyring first
    val = _try_keyring_get(key_name)
    if val and val.strip():
        return val

    # Fall back to encrypted file
    data = _file_read_all()
    val = data.get(key_name, "")
    return val if val else None


def get_status() -> dict[str, bool]:
    """Return which keys are configured."""
    data = _file_read_all()
    name_map = {
        "deepseek_api_key": "deepseek",
        "coze_api_key": "coze",
        "debate_bot_id": "debate_bot",
        "discuss_bot_id": "discuss_bot",
        "minecraft_bot_id": "minecraft_bot",
    }
    result = {}
    for key_name in ALL_KEYS:
        # Check keyring first, then file
        v = _try_keyring_get(key_name)
        if not v or not v.strip():
            v = data.get(key_name, "")
        frontend_name = name_map.get(key_name, key_name)
        result[frontend_name] = bool(v and v.strip())
    return result


def delete_all_keys() -> None:
    """Delete all stored keys."""
    for key_name in ALL_KEYS:
        _try_keyring_delete(key_name)

    data = _file_read_all()
    for key_name in ALL_KEYS:
        data.pop(key_name, None)
    _file_write_all(data)


def _delete_key(key_name: str) -> None:
    """Internal: delete a single key."""
    _try_keyring_delete(key_name)
    data = _file_read_all()
    data.pop(key_name, None)
    _file_write_all(data)
