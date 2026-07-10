"""Flask API server — AI Novel Translator + Debater + Minecraft.

Three fully-isolated subsystems, each with its own:
  - Backend router   (systems/<name>/router.py)
  - Session storage  (systems/<name>/session_storage.py → data/<name>/)
  - Frontend module  (frontend/src/systems/<name>/)

Shared core layer:
  - core/coze_client.py  — COZE v3 async API wrapper
  - core/config.py       — environment constants (port, API base URLs, etc.)

API Keys are NEVER stored on the backend.  The frontend sends api_key / bot_id
with every request and stores them in localStorage via configStore.js.

Routes per subsystem:
  Debater:    POST /api/debater/chat    GET|DELETE /api/debater/session
  Novel:      POST /api/novel/translate  GET|DELETE /api/novel/session
  Minecraft:  POST /api/minecraft/chat   GET|DELETE /api/minecraft/session

Supports:
  - Dev mode:  Vite dev server proxies /api to Flask (port 5000)
  - EXE mode:  Flask serves built frontend + API on the same port
"""

import json
import os
import sys
import time
import mimetypes
import threading
from pathlib import Path
from datetime import datetime, timezone, timedelta
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from core.config import FLASK_PORT, FLASK_HOST, MAX_CONTENT_LENGTH
from shutdown import register_shutdown_handlers, request_shutdown, is_shutting_down


def create_app() -> Flask:
    """Build and configure the Flask application."""
    # ── Paths (PyInstaller-aware) ──────────────────────────────
    if getattr(sys, "frozen", False):
        base_dir = sys._MEIPASS
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))

    static_dir = os.path.join(base_dir, "static")
    has_static = os.path.isdir(static_dir)

    # ── App ────────────────────────────────────────────────────
    app = Flask(__name__)
    CORS(app)
    app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH

    # ── Register subsystem route groups ─────────────────────────
    from systems.novel.router import register_novel_routes
    from systems.debater.router import register_debater_routes
    from systems.minecraft.router import register_minecraft_routes
    from systems.diary.router import register_diary_routes
    from systems.vocab.router import register_vocab_routes

    register_novel_routes(app)
    register_debater_routes(app)
    register_minecraft_routes(app)
    register_diary_routes(app)
    register_vocab_routes(app)

    # ── Config / Keyring routes ─────────────────────────────────
    from systems.config.keyring_store import set_key, get_key, get_status, delete_all_keys

    @app.route("/api/config/set", methods=["POST"])
    def config_set():
        """Store an API key or bot ID in Windows Credential Manager."""
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Request body must be JSON"}), 400
        key = data.get("key", "").strip()
        value = data.get("value", "")
        if not key:
            return jsonify({"error": "'key' is required"}), 400
        try:
            set_key(key, value)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        except RuntimeError as e:
            return jsonify({"error": str(e)}), 500
        return jsonify({"status": "ok"})

    @app.route("/api/config/status", methods=["GET"])
    def config_status():
        """Return which keys are configured (booleans, no plaintext)."""
        return jsonify(get_status())

    @app.route("/api/config/get", methods=["GET"])
    def config_get():
        """Return ALL stored keys (plaintext). Called by App on mount to restore Zustand.
        Protected by localhost-only check — same as /api/shutdown."""
        if request.remote_addr not in ("127.0.0.1", "::1", "localhost"):
            return jsonify({"error": "Forbidden"}), 403
        name_map = {
            "deepseek_api_key": "deepseekApiKey",
            "coze_api_key": "cozeApiKey",
            "debate_bot_id": "debateBotId",
            "discuss_bot_id": "discussBotId",
            "minecraft_bot_id": "minecraftBotId",
        }
        result = {}
        for key_name, frontend_name in name_map.items():
            val = get_key(key_name)
            result[frontend_name] = val if val else ""
        return jsonify(result)

    @app.route("/api/config/keys", methods=["DELETE"])
    def config_delete_keys():
        """Delete all stored keys from the credential manager."""
        delete_all_keys()
        return jsonify({"status": "cleared"})

    # ── Dashboard stats ─────────────────────────────────────────
    @app.route("/api/dashboard/stats", methods=["GET"])
    def dashboard_stats():
        """Aggregate learning statistics from all subsystems.

        Returns:
            {
              today: {novel_chars, diary_count, debate_rounds, vocab_added},
              streak: int,
              total_vocab: int,
              modules: {novel: bool, diary: bool, debater: bool, minecraft: bool}
            }
        """
        data_dir = app.config.get("DASHBOARD_DATA_DIR")
        if data_dir:
            data_root = Path(data_dir)
        else:
            data_root = Path(os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "data"
            ))

        now_ts = time.time()
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        # Use a Unix epoch day boundary for timestamp-based comparisons:
        # midnight today UTC as a float timestamp
        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        ).timestamp()

        # ── Novel stats ──────────────────────────────────────────
        novel_chars = 0
        novel_has_data = False
        novel_dir = data_root / "novel"
        if novel_dir.exists():
            for sf in novel_dir.glob("session_*.json"):
                try:
                    with open(sf, "r", encoding="utf-8") as fh:
                        session = json.load(fh)
                    novel_has_data = True
                    for msg in session.get("messages", []):
                        if msg.get("role") == "assistant":
                            msg_ts = msg.get("timestamp", 0)
                            if msg_ts >= today_start:
                                novel_chars += len(msg.get("content", ""))
                except (json.JSONDecodeError, IOError):
                    pass

        # ── Diary stats ──────────────────────────────────────────
        diary_count = 0
        diary_has_data = False
        diary_dir = data_root / "diary"
        all_diary_dates = set()
        if diary_dir.exists():
            entries_path = diary_dir / "entries.json"
            if entries_path.exists():
                try:
                    with open(entries_path, "r", encoding="utf-8") as fh:
                        diary_data = json.load(fh)
                    entries = diary_data.get("entries", [])
                    if entries:
                        diary_has_data = True
                    for entry in entries:
                        d = entry.get("date", "")
                        if d:
                            all_diary_dates.add(d)
                            if d == today_str:
                                diary_count += 1
                except (json.JSONDecodeError, IOError):
                    pass

        # ── Streak calculation ───────────────────────────────────
        streak = 0
        if all_diary_dates:
            today_dt = datetime.now(timezone.utc).date()
            check = today_dt
            while check.strftime("%Y-%m-%d") in all_diary_dates:
                streak += 1
                check = check - timedelta(days=1)

        # ── Debater stats ────────────────────────────────────────
        debate_rounds = 0
        debater_has_data = False
        debater_dir = data_root / "debater"
        if debater_dir.exists():
            for sf in debater_dir.glob("session_*.json"):
                try:
                    with open(sf, "r", encoding="utf-8") as fh:
                        session = json.load(fh)
                    debater_has_data = True
                    for msg in session.get("messages", []):
                        if msg.get("role") == "user":
                            msg_ts = msg.get("timestamp", 0)
                            if msg_ts >= today_start:
                                debate_rounds += 1
                except (json.JSONDecodeError, IOError):
                    pass

        # ── Vocab stats ──────────────────────────────────────────
        vocab_added = 0
        total_vocab = 0
        vocab_has_data = False
        from systems.vocab.vault import vocab_vault
        data = vocab_vault._read_all()
        for word_entry in data.get("words", {}).values():
            total_vocab += 1
            vocab_has_data = True
            created = word_entry.get("created_at", "")
            if created:
                # created_at is ISO format, extract date part
                word_date = created[:10]  # "2026-07-07" portion
                if word_date == today_str:
                    vocab_added += 1

        # ── Minecraft stats ──────────────────────────────────────
        minecraft_has_data = False
        minecraft_dir = data_root / "minecraft"
        if minecraft_dir.exists():
            session_files = list(minecraft_dir.glob("session_*.json"))
            if session_files:
                minecraft_has_data = True

        return jsonify({
            "today": {
                "novel_chars": novel_chars,
                "diary_count": diary_count,
                "debate_rounds": debate_rounds,
                "vocab_added": vocab_added,
            },
            "streak": streak,
            "total_vocab": total_vocab,
            "modules": {
                "novel": novel_has_data,
                "diary": diary_has_data,
                "debater": debater_has_data,
                "minecraft": minecraft_has_data,
            },
        })

    # ── Health check ────────────────────────────────────────────
    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"})

    # ── Shutdown (EXE mode) ────────────────────────────────────
    @app.route("/api/shutdown", methods=["POST"])
    def api_shutdown():
        if request.remote_addr not in ("127.0.0.1", "::1", "localhost"):
            return jsonify({"error": "Forbidden"}), 403
        request_shutdown()
        return jsonify({"status": "shutting_down"})

    # ── Frontend static serving (production / EXE mode) ─────────
    @app.route("/")
    def serve_index():
        if has_static:
            return send_from_directory(static_dir, "index.html")
        return jsonify({"error": "Frontend not built."}), 404

    @app.route("/<path:path>")
    def serve_frontend(path):
        if has_static:
            file_path = os.path.join(static_dir, path)
            if os.path.isfile(file_path):
                mimetype, _ = mimetypes.guess_type(file_path)
                return send_from_directory(static_dir, path, mimetype=mimetype)
            return send_from_directory(static_dir, "index.html")
        return jsonify({"error": "Not found"}), 404

    # Attach state for the startup block below
    app._has_static = has_static
    app._static_dir = static_dir
    return app


# ── Startup ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import webview

    register_shutdown_handlers()

    app = create_app()
    has_static = app._has_static

    print("=" * 56)
    print(f"  Static: {'present' if has_static else 'missing — dev mode'}")
    print("=" * 56)
    print("  AI English Learning Studio v2.0.0")
    print(f"  URL:  http://{FLASK_HOST}:{FLASK_PORT}")
    print("  Modules: Dashboard, Novel, Diary, Debater, Minecraft, Vocab Vault")
    print("=" * 56)

    # EXE / GUI mode: Flask in daemon thread, desktop window via pywebview.
    if getattr(sys, "frozen", False):
        flask_thread = threading.Thread(
            target=lambda: app.run(
                debug=False,
                host=FLASK_HOST,
                port=FLASK_PORT,
                use_reloader=False,
            ),
            daemon=True,
        )
        flask_thread.start()

        # Give Flask a moment to start, then launch the native window.
        time.sleep(1.0)

        webview.create_window(
            title="AI English Learning Studio v2.0.0",
            url=f"http://{FLASK_HOST}:{FLASK_PORT}",
            width=1200,
            height=800,
            min_size=(900, 600),
        )
        webview.start()

        # Window closed — shut down.
        request_shutdown()
        sys.exit(0)

    # Dev mode: open browser, run Flask in foreground.
    else:
        if has_static:
            threading.Timer(
                1.0,
                lambda: webbrowser.open(f"http://{FLASK_HOST}:{FLASK_PORT}"),
            ).start()

        try:
            app.run(debug=False, host=FLASK_HOST, port=FLASK_PORT, use_reloader=False)
        except KeyboardInterrupt:
            pass
