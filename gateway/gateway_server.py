"""AI English Learning Studio — hosted gateway server.

Run from within ``gateway/`` (or via Docker)::

    cd gateway && python gateway_server.py

The gateway holds the developer's real DeepSeek/Coze credentials (from env
vars, see ``.env.example``) and exposes a single generic endpoint that the
desktop app calls in "hosted" mode.  Activation codes are validated and
metered before any AI call is forwarded.

Endpoints:
    GET  /v1/health           — liveness check
    POST /v1/ai               — {op, params} + Authorization: Bearer <code>
    POST /v1/chat/completions — OpenAI-compatible (Minebot/Mindcraft DeepSeek)
"""

import os
import sys
from pathlib import Path

# Reuse the app's AI engines without copying them.
BACKEND_DIR = str(Path(__file__).resolve().parent.parent / "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

try:  # load gateway/.env if present (local dev)
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except Exception:
    pass

from flask import Flask, request, jsonify  # noqa: E402
from flask_cors import CORS  # noqa: E402

from auth import AuthError, validate  # noqa: E402
import ops  # noqa: E402
import audit  # noqa: E402


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)

    @app.route("/v1/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"})

    @app.route("/v1/ai", methods=["POST"])
    def ai():
        auth = request.headers.get("Authorization", "")
        code = auth[len("Bearer "):].strip() if auth.startswith("Bearer ") else ""

        if not code:
            return jsonify({"ok": False, "error": "缺少激活码"}), 401

        try:
            validate(code)
        except AuthError as e:
            audit.log(code, "", ok=False, detail=f"auth: {e.message}")
            return jsonify({"ok": False, "error": e.message}), e.status_code

        data = request.get_json(silent=True)
        if not data:
            return jsonify({"ok": False, "error": "请求体必须为 JSON"}), 400

        op = data.get("op", "")
        params = data.get("params") or {}
        fn = ops.OPS.get(op)
        if fn is None:
            audit.log(code, op, ok=False, detail="unknown op")
            return jsonify({"ok": False, "error": f"未知操作：{op}"}), 400

        try:
            result = fn(params)
        except Exception as e:  # noqa: BLE001 — surface a clean message to the client
            audit.log(code, op, ok=False, detail=str(e))
            return jsonify({"ok": False, "error": str(e)}), 502

        audit.log(code, op, ok=True)
        return jsonify({"ok": True, "result": result})

    @app.route("/v1/chat/completions", methods=["POST"])
    def chat_completions():
        auth = request.headers.get("Authorization", "")
        code = auth[len("Bearer "):].strip() if auth.startswith("Bearer ") else ""

        if not code:
            return jsonify({"error": {"message": "缺少激活码", "type": "auth_error"}}), 401

        try:
            validate(code)
        except AuthError as e:
            audit.log(code, "chat_completions", ok=False, detail=f"auth: {e.message}")
            return jsonify({"error": {"message": e.message, "type": "auth_error"}}), e.status_code

        payload = request.get_json(silent=True) or {}
        try:
            result = ops.chat_completions(payload)
        except Exception as e:  # noqa: BLE001
            audit.log(code, "chat_completions", ok=False, detail=str(e))
            return jsonify({"error": {"message": str(e), "type": "api_error"}}), 502

        audit.log(code, "chat_completions", ok=True)
        return jsonify(result)

    return app


if __name__ == "__main__":
    # Railway injects PORT; fall back to AIES_GATEWAY_PORT (local/Docker), then 9000.
    port = int(os.environ.get("PORT") or os.environ.get("AIES_GATEWAY_PORT") or "9000")
    create_app().run(host="0.0.0.0", port=port, debug=False)
