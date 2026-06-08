"""Minecraft subsystem routes (placeholder).

POST   /api/minecraft/chat      — send message to COZE bot, get AI reply
GET    /api/minecraft/sessions   — list all sessions (metadata)
GET    /api/minecraft/session    — get full session with messages
DELETE /api/minecraft/session    — delete a session
"""

from flask import request, jsonify
from core.coze_client import chat_with_bot
from systems.minecraft.session_storage import minecraft_storage


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
        if not api_key:
            return jsonify({"error": "COZE API Key is required"}), 400
        if not bot_id:
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
            result = chat_with_bot(
                api_key=api_key,
                bot_id=bot_id,
                user_message=message,
                conversation_id=conversation_id,
                api_url=api_url,
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
