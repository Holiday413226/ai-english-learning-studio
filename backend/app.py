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

import os
import sys
import time
import mimetypes
import threading
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

    register_novel_routes(app)
    register_debater_routes(app)
    register_minecraft_routes(app)

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

    @app.route("/api/config/keys", methods=["DELETE"])
    def config_delete_keys():
        """Delete all stored keys from the credential manager."""
        delete_all_keys()
        return jsonify({"status": "cleared"})

    # ── Vocab Vault routes ─────────────────────────────────────
    from systems.vocab.router import register_vocab_routes
    register_vocab_routes(app)

    # ── Diary routes ────────────────────────────────────────────
    from systems.diary.router import register_diary_routes
    register_diary_routes(app)

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
    import webbrowser

    register_shutdown_handlers()

    app = create_app()
    has_static = app._has_static

    print("=" * 56)
    print(f"  Static: {'present' if has_static else 'missing — dev mode'}")
    print("=" * 56)
    print("  AI Tool Suite Server")
    print(f"  URL:  http://{FLASK_HOST}:{FLASK_PORT}")
    print("  Subsystems: Novel, Debater, Minecraft")
    print("  Press Ctrl+C to stop the server")
    print("=" * 56)

    if has_static:
        threading.Timer(
            1.0,
            lambda: webbrowser.open(f"http://{FLASK_HOST}:{FLASK_PORT}"),
        ).start()

    # EXE mode: Flask in daemon thread, main thread watches for exit.
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
        try:
            while not is_shutting_down():
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        finally:
            request_shutdown()
            print("\n  Exiting...", file=sys.stderr)
            flask_thread.join(timeout=3)
            sys.exit(0)
    else:
        try:
            app.run(debug=False, host=FLASK_HOST, port=FLASK_PORT, use_reloader=False)
        except KeyboardInterrupt:
            pass
