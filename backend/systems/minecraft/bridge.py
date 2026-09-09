"""Lightweight MinebotBridge — spawn / stop the external Node.js Mindcraft process.

Deliberately minimal: no history import, no Socket.IO, no file scanning.
The external MindServer handles its own UI via settings.auto_open_ui.
"""

import json
import os
import socket
import subprocess
import sys
import threading
import time


# ── Config (env-overridable) ──────────────────────────────────────────────

# Mindcraft 已收敛进本仓库：默认指向 agent 内的 Minebot/mindcraft（可用 MINEBOT_DIR 覆盖）
if getattr(sys, "frozen", False):
    # EXE mode: runtime 位于 exe 同级的 runtime/（捆绑的 node.exe + mindcraft）。
    _EXE_DIR = os.path.dirname(sys.executable)
    _DEFAULT_MINEBOT_DIR = os.path.join(_EXE_DIR, "runtime", "mindcraft")
    _NODE_EXE = os.path.join(_EXE_DIR, "runtime", "node", "node.exe")
else:
    # Dev mode: mindcraft 在本仓库内，node 走系统 PATH。
    _AGENT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    _DEFAULT_MINEBOT_DIR = os.path.join(_AGENT_ROOT, "Minebot", "mindcraft")
    _NODE_EXE = None

MINEBOT_DIR = os.getenv("MINEBOT_DIR", _DEFAULT_MINEBOT_DIR)
MINEBOT_HOST = os.getenv("MINEBOT_HOST", "127.0.0.1")
MINEBOT_PORT = int(os.getenv("MINEBOT_PORT", "8080"))


def _is_port_open(host: str, port: int, timeout: float = 1.0) -> bool:
    """Return True if *host:port* accepts a TCP connection."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (ConnectionRefusedError, OSError):
        return False


def _child_env() -> dict:
    """Build the environment for the Node Mindcraft child process.

    Mindcraft resolves the DeepSeek key via ``getKey('DEEPSEEK_API_KEY')``
    (src/utils/keys.js), which reads ``./keys.json`` first, then falls back
    to ``process.env['DEEPSEEK_API_KEY']``.  We deliberately do NOT write a
    ``keys.json`` into runtime/ — that would drop a plaintext key into the
    distributable.  Instead, inject the key the user already stored in the
    Windows credential store straight into the child process environment.
    """
    env = os.environ.copy()
    try:
        from systems.config.keyring_store import get_key
        from core.gateway_client import is_hosted, get_gateway_url, get_activation_code
        if is_hosted():
            # Hosted mode: route the Minebot's DeepSeek calls through the
            # gateway's OpenAI-compatible endpoint.  The activation code is
            # used as the "API key" so getKey('DEEPSEEK_API_KEY') returns it.
            env["DEEPSEEK_API_KEY"] = get_activation_code()
            env["DEEPSEEK_API_URL"] = get_gateway_url() + "/v1"
        else:
            deepseek_key = get_key("deepseek_api_key")
            if deepseek_key:
                env["DEEPSEEK_API_KEY"] = deepseek_key
    except Exception:
        # Keyring may be unavailable (first run / EXE sandbox) — leave the
        # child to fall back to keys.json or pre-existing env vars.
        pass
    return env


# ── Layer selector — read/write the deepseek profile's `layers` field ──────
# The 4 toggleable layers sit over the always-on base (literal !command + skills).
# Changes only take effect after the Mindcraft process restarts.

DEFAULT_LAYERS = {
    "intent": True,       # Cognitive LLM → structured action proposal
    "persona_gate": True, # Persona accept/reject/modify decision gate
    "expression": True,   # Expression LLM → natural-language narration
    "autonomy": True,     # SelfPrompter + proactive autonomous modes
}

PROFILE_NAME = "deepseek"


def _profile_path(name: str = PROFILE_NAME) -> str:
    return os.path.join(MINEBOT_DIR, "profiles", f"{name}.json")


def _read_profile(name: str = PROFILE_NAME) -> dict:
    path = _profile_path(name)
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def get_layers() -> dict:
    """Return the deepseek profile's layers, merged over defaults."""
    layers = dict(DEFAULT_LAYERS)
    layers.update(_read_profile().get("layers") or {})
    return layers


def set_layers(layers: dict) -> tuple:
    """Write the deepseek profile's `layers` field. Returns (ok, message)."""
    path = _profile_path()
    profile = _read_profile()
    if not profile:
        return False, f"Profile not found or unreadable: {path}"

    clean = {}
    for key in DEFAULT_LAYERS:
        if key in layers and isinstance(layers[key], bool):
            clean[key] = layers[key]
    if not clean:
        return False, "No valid layer keys provided (expected boolean values)."

    profile["layers"] = clean
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(profile, f, ensure_ascii=False, indent=4)
    except OSError as exc:
        return False, f"Cannot write profile: {exc}"

    return True, ""


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
                node_cmd = _NODE_EXE if (_NODE_EXE and os.path.isfile(_NODE_EXE)) else "node"
                self._process = subprocess.Popen(
                    [node_cmd, "main.js"],
                    cwd=mindcraft_dir,
                    env=_child_env(),
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
        """Gracefully stop the external process (and its child processes).

        Mindcraft's main.js spawns one child ``init_agent.js`` per agent.
        On Windows ``terminate()`` only kills the direct child, leaving those
        agent processes orphaned — they then hold resources and can make the
        next start crash.  ``taskkill /T`` kills the whole tree.
        """
        with self._lock:
            if self._process is None:
                return {"status": "not_running", "message": "No process."}

            if self._process.poll() is not None:
                self._process = None
                return {"status": "not_running", "message": "Already exited."}

            pid = self._process.pid
            try:
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(pid)],
                    capture_output=True,
                    timeout=15,
                )
            except (OSError, subprocess.TimeoutExpired):
                # Fallback to the direct child only.
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
