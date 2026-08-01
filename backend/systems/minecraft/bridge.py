"""Lightweight MinebotBridge — spawn / stop the external Node.js Mindcraft process.

Deliberately minimal: no history import, no Socket.IO, no file scanning.
The external MindServer handles its own UI via settings.auto_open_ui.
"""

import os
import socket
import subprocess
import threading
import time


# ── Config (env-overridable) ──────────────────────────────────────────────

MINEBOT_DIR = os.getenv("MINEBOT_DIR", "E:/New Life/Minebot/mindcraft")
MINEBOT_HOST = os.getenv("MINEBOT_HOST", "127.0.0.1")
MINEBOT_PORT = int(os.getenv("MINEBOT_PORT", "8080"))


def _is_port_open(host: str, port: int, timeout: float = 1.0) -> bool:
    """Return True if *host:port* accepts a TCP connection."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (ConnectionRefusedError, OSError):
        return False


# ═══════════════════════════════════════════════════════════════════════════
# MinebotBridge
# ═══════════════════════════════════════════════════════════════════════════


class MinebotBridge:
    """Manage the external Mindcraft Node.js process."""

    def __init__(self) -> None:
        self._process: subprocess.Popen | None = None
        self._lock = threading.Lock()

    # ── Public API ──────────────────────────────────────────────────────

    def start(self) -> dict:
        """Launch the external Node.js process.  Returns immediately.

        The external project's auto_open_ui setting opens its own browser
        dashboard once the server is ready.
        """
        with self._lock:
            if self._process is not None and self._process.poll() is None:
                return {"status": "already_running",
                        "message": "Minebot process is already running."}

            if _is_port_open(MINEBOT_HOST, MINEBOT_PORT):
                return {"status": "already_running",
                        "message": f"Port {MINEBOT_PORT} is already in use."}

            mindcraft_dir = MINEBOT_DIR
            main_js = os.path.join(mindcraft_dir, "main.js")
            if not os.path.isfile(main_js):
                return {"status": "error",
                        "message": f"main.js not found in {mindcraft_dir}"}

            try:
                # No stdio redirects — inherit parent console so the Node
                # process can open its browser UI (auto_open_ui) freely.
                self._process = subprocess.Popen(
                    ["node", "main.js"],
                    cwd=mindcraft_dir,
                    env=os.environ.copy(),
                )
            except FileNotFoundError:
                return {"status": "error",
                        "message": "Node.js not found. Install Node.js or add to PATH."}
            except OSError as exc:
                return {"status": "error", "message": str(exc)}

        # Spawn a short-lived daemon thread that waits for the port to open
        # so get_status() reflects reality as soon as possible.
        def _wait_for_port():
            for _ in range(40):  # 20 seconds max
                if _is_port_open(MINEBOT_HOST, MINEBOT_PORT, timeout=1.0):
                    break
                if self._process and self._process.poll() is not None:
                    break  # process died
                time.sleep(0.5)

        threading.Thread(target=_wait_for_port, daemon=True).start()

        return {"status": "ok", "message": "Minebot launching..."}

    def stop(self) -> dict:
        """Gracefully stop the external process."""
        with self._lock:
            if self._process is None:
                return {"status": "not_running", "message": "No process."}

            if self._process.poll() is not None:
                self._process = None
                return {"status": "not_running", "message": "Already exited."}

            try:
                self._process.terminate()
                try:
                    self._process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    self._process.kill()
                    self._process.wait(timeout=5)
            except OSError:
                pass

            self._process = None

        return {"status": "ok", "message": "Minebot stopped."}

    def get_status(self) -> dict:
        """Return whether the MindServer is reachable."""
        running = (
            (self._process is not None and self._process.poll() is None)
            or _is_port_open(MINEBOT_HOST, MINEBOT_PORT)
        )
        return {"minebot_running": running}
