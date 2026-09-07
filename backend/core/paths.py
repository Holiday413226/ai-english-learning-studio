"""Filesystem path resolution for persistent data.

In PyInstaller EXE mode, ``__file__`` points into the temp ``_MEIPASS``
extraction dir (wiped on exit), so session/vocab data must live in a
persistent writable location under ``%APPDATA%``.  In dev mode, data stays
in ``backend/data/`` as before.
"""

import os
import sys

_APP_NAME = "AIEnglishStudio"
_DATA_ROOT = None


def get_data_root() -> str:
    """Return the persistent writable data directory (created if needed).

    EXE mode: ``%APPDATA%/AIEnglishStudio/data`` (fallback
    ``~/.ai_english_studio/data``).
    Dev mode: ``backend/data/``.
    """
    global _DATA_ROOT
    if _DATA_ROOT:
        return _DATA_ROOT

    if getattr(sys, "frozen", False):
        candidates = [
            os.path.join(os.environ.get("APPDATA", ""), _APP_NAME, "data"),
            os.path.join(os.path.expanduser("~"), ".ai_english_studio", "data"),
        ]
        for d in candidates:
            try:
                os.makedirs(d, exist_ok=True)
                _DATA_ROOT = d
                return d
            except OSError:
                continue

    # Dev mode (and ultimate fallback): backend/data/
    d = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"
    )
    os.makedirs(d, exist_ok=True)
    _DATA_ROOT = d
    return d
