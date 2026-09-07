"""Best-effort audit logging for gateway requests.

Each AI request appends one JSON line to ``gateway/data/usage.log`` recording
the activation code, op, and outcome.  This lets the operator spot abnormal
usage (a single code spiking, unknown ops, auth failures) without shipping
logs anywhere.  Audit writing never raises — a full disk or bad path must not
break an in-flight request.
"""

import json
import os
import threading
from datetime import datetime

LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "usage.log")
_lock = threading.Lock()


def log(code: str, op: str, ok: bool, detail: str = "") -> None:
    """Append a single JSON line: {ts, code, op, ok, detail}."""
    entry = {
        "ts": datetime.now().isoformat(timespec="seconds"),
        "code": (code or "")[:64],
        "op": (op or "")[:64],
        "ok": bool(ok),
        "detail": (detail or "")[:200],
    }
    with _lock:
        try:
            os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
            with open(LOG_PATH, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except OSError:
            pass
