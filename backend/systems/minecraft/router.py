"""Minecraft subsystem routes.

POST   /api/minecraft/chat               — send message to COZE bot, get AI reply
GET    /api/minecraft/sessions            — list all sessions (metadata)
GET    /api/minecraft/session             — get full session with messages
DELETE /api/minecraft/session             — delete a session

Companion panel endpoints (read-only):
GET    /api/minecraft/companion/status    — bot online status + session count
GET    /api/minecraft/companion/sessions  — list sessions (companion format)
GET    /api/minecraft/companion/session   — full session (companion format)
POST   /api/minecraft/companion/refresh   — trigger session scan from disk
"""

from flask import request, jsonify
from core.coze_client import chat_with_bot
from systems.minecraft.session_storage import minecraft_storage
from systems.minecraft.bridge import MinebotBridge, get_layers, set_layers
from core.gateway_client import run_ai, is_hosted


def register_minecraft_routes(app):
    """Register Minecraft subsystem routes on the Flask app."""

    @app.route("/api/minecraft/chat", methods=["POST"])
    def minecraft_chat():
        """Send a message to COZE and return the AI response.

        Body: {
            api_key: str, bot_id: str, session_id: str,
            message: str,
            api_url: str (optional)
        }
        Returns: { session_id, text, audio_url }
        """
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Request body must be JSON"}), 400

        api_key = data.get("api_key", "").strip()
        bot_id = data.get("bot_id", "").strip()
        session_id = data.get("session_id", "").strip()
        message = data.get("message", "").strip()
        api_url = data.get("api_url", "").strip() or None

        # Validation
        if not api_key and not is_hosted():
            return jsonify({"error": "COZE API Key is required"}), 400
        if not bot_id and not is_hosted():
            return jsonify({"error": "Bot ID is required"}), 400
        if not message:
            return jsonify({"error": "Message is required"}), 400

        # Ensure session exists
        sid = minecraft_storage.get_or_create(session_id, bot_id=bot_id)

        # Check message cap
        if minecraft_storage.is_full(sid):
            return jsonify({"error": "Session message limit reached (100)"}), 400

        # Call COZE
        conversation_id = minecraft_storage.get_conversation_id(sid)
        try:
            result = run_ai(
                "minecraft_chat_coze",
                {"message": message, "conversation_id": conversation_id},
                lambda: chat_with_bot(
                    api_key=api_key,
                    bot_id=bot_id,
                    user_message=message,
                    conversation_id=conversation_id,
                    api_url=api_url,
                ),
            )
        except RuntimeError as e:
            msg = str(e)
            if "Invalid" in msg or "401" in msg or "403" in msg:
                return jsonify({"error": msg}), 401
            return jsonify({"error": msg}), 502

        # Store messages in session (persisted to disk)
        minecraft_storage.add_messages(sid, [
            {"role": "user", "content": message, "audio_url": None},
            {
                "role": "assistant",
                "content": result["text"],
                "audio_url": result.get("audio_url"),
            },
        ])

        # Update COZE conversation_id for multi-turn
        conv_id = result.get("conversation_id")
        if conv_id:
            minecraft_storage.set_conversation_id(sid, conv_id)

        return jsonify({
            "session_id": sid,
            "text": result["text"],
            "audio_url": result.get("audio_url"),
        })

    @app.route("/api/minecraft/sessions", methods=["GET"])
    def minecraft_list_sessions():
        """Return all sessions (metadata only)."""
        return jsonify({"sessions": minecraft_storage.list_all()})

    @app.route("/api/minecraft/session", methods=["GET"])
    def minecraft_get_session():
        """Return a single session with full message history.

        Query: ?session_id=xxx
        """
        session_id = request.args.get("session_id", "").strip()
        if not session_id:
            return jsonify({"error": "session_id query parameter is required"}), 400
        s = minecraft_storage.get_full(session_id)
        if not s:
            return jsonify({"error": "Session not found"}), 404
        return jsonify(s)

    @app.route("/api/minecraft/session", methods=["DELETE"])
    def minecraft_delete_session():
        """Delete a session.

        Query: ?session_id=xxx
        """
        session_id = request.args.get("session_id", "").strip()
        if not session_id:
            return jsonify({"error": "session_id query parameter is required"}), 400
        if minecraft_storage.delete(session_id):
            return jsonify({"status": "deleted"})
        return jsonify({"error": "Session not found"}), 404

    # ── Companion panel endpoints (read-only) ──────────────────────

    @app.route("/api/minecraft/companion/status", methods=["GET"])
    def companion_status():
        """Return bot online status, name, last_seen, and session count.

        GET /api/minecraft/companion/status
        → {bot_online: bool, bot_name: str, last_seen: str|null, session_count: int}
        """
        return jsonify(minecraft_storage.get_bot_status())

    @app.route("/api/minecraft/companion/sessions", methods=["GET"])
    def companion_list_sessions():
        """List all sessions with metadata (companion format).

        GET /api/minecraft/companion/sessions
        → {sessions: [{session_id, message_count, updated_at, preview}]}
        """
        return jsonify({"sessions": minecraft_storage.list_all()})

    @app.route("/api/minecraft/companion/session", methods=["GET"])
    def companion_get_session():
        """Return a single session with full message history.

        GET /api/minecraft/companion/session?session_id=xxx
        → {session_id, messages: [...], updated_at}
        """
        session_id = request.args.get("session_id", "").strip()
        if not session_id:
            return jsonify({"error": "session_id query parameter is required"}), 400
        s = minecraft_storage.get_full(session_id)
        if not s:
            return jsonify({"error": "Session not found"}), 404
        return jsonify(s)

    @app.route("/api/minecraft/companion/refresh", methods=["POST"])
    def companion_refresh():
        """Trigger a re-scan of session files from the Minebot data directory.

        POST /api/minecraft/companion/refresh
        → {status: "ok", sessions_found: int}
        """
        count = minecraft_storage.scan_sessions()
        return jsonify({"status": "ok", "sessions_found": count})

    # ── Layer selector endpoints ─────────────────────────────────────

    @app.route("/api/minecraft/layers", methods=["GET"])
    def minecraft_get_layers():
        """Return the layer-selector config for the deepseek bot.

        GET /api/minecraft/layers
        → {profile: "deepseek", layers: {intent, persona_gate, expression, autonomy}}
        """
        return jsonify({"profile": "deepseek", "layers": get_layers()})

    @app.route("/api/minecraft/layers", methods=["POST"])
    def minecraft_set_layers():
        """Update the layer-selector config for the deepseek bot.

        Body: {layers: {intent: bool, persona_gate: bool, expression: bool, autonomy: bool}}
        Returns: {status: "ok", layers: {...}} | {error: str}
        Changes take effect after the Minebot process restarts.
        """
        data = request.get_json(silent=True) or {}
        ok, message = set_layers(data.get("layers") or {})
        if not ok:
            return jsonify({"error": message}), 400
        return jsonify({"status": "ok", "layers": get_layers()})

    # ── Bridge control endpoints ────────────────────────────────────

    @app.route("/api/minecraft/bridge/start", methods=["POST"])
    def bridge_start():
        """Launch the external Mindcraft process.

        POST /api/minecraft/bridge/start
        → {status: "ok"|"already_running"|"error", message: str}
        """
        bridge: MinebotBridge = app.minebot_bridge
        result = bridge.start()
        return jsonify(result)

    @app.route("/api/minecraft/bridge/stop", methods=["POST"])
    def bridge_stop():
        """Stop the external Mindcraft process.

        POST /api/minecraft/bridge/stop
        → {status: "ok"|"not_running", message: str}
        """
        bridge: MinebotBridge = app.minebot_bridge
        result = bridge.stop()
        return jsonify(result)

    @app.route("/api/minecraft/bridge/status", methods=["GET"])
    def bridge_status():
        """Return bridge runtime status.

        GET /api/minecraft/bridge/status
        → {minecraft_running: bool}
        """
        bridge: MinebotBridge = app.minebot_bridge
        return jsonify(bridge.get_status())
