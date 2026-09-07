"""Debater subsystem routes.

POST   /api/debater/chat      — send message (DeepSeek or COZE), get AI reply
POST   /api/debater/score     — score conversation via DeepSeek
GET    /api/debater/sessions   — list all sessions (metadata)
GET    /api/debater/session    — get full session with messages
DELETE /api/debater/session    — delete a session
"""

from flask import request, jsonify
from core.coze_client import chat_with_bot
from systems.debater.deepseek_client import chat_with_deepseek
from systems.debater.session_storage import debater_storage
from systems.debater.scorer import score_conversation
from core.gateway_client import run_ai, is_hosted


def register_debater_routes(app):
    """Register Debater subsystem routes on the Flask app."""

    @app.route("/api/debater/chat", methods=["POST"])
    def debater_chat():
        """Send a message and return the AI response.

        Body: {
            provider: "deepseek"|"coze" (default "coze"),
            api_key: str, bot_id: str (COZE only), session_id: str,
            message: str, mode: "debate"|"discuss",
            api_url: str (optional, COZE only)
        }
        Returns: { session_id, text, audio_url }
        """
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Request body must be JSON"}), 400

        provider = data.get("provider", "coze").strip().lower()
        api_key = data.get("api_key", "").strip()
        bot_id = data.get("bot_id", "").strip()
        session_id = data.get("session_id", "").strip()
        message = data.get("message", "").strip()
        mode = data.get("mode", "debate")
        api_url = data.get("api_url", "").strip() or None

        # Shared validation
        if provider not in ("deepseek", "coze"):
            return jsonify({"error": "Provider must be 'deepseek' or 'coze'"}), 400
        if not message:
            return jsonify({"error": "Message is required"}), 400
        if mode not in ("debate", "discuss"):
            return jsonify({"error": "Mode must be 'debate' or 'discuss'"}), 400
        if not api_key and not is_hosted():
            label = "DeepSeek" if provider == "deepseek" else "COZE"
            return jsonify({"error": f"{label} API Key is required"}), 400

        # ── DeepSeek provider ────────────────────────────────────
        if provider == "deepseek":
            # DeepSeek is stateless: no bot_id, no conversation_id.
            sid = debater_storage.get_or_create(session_id, mode=mode, bot_id="")

            if debater_storage.is_full(sid):
                return jsonify({"error": "Session message limit reached (100)"}), 400

            history = debater_storage.get_messages(sid) or []
            history.append({"role": "user", "content": message})

            try:
                result = run_ai(
                    "debater_chat_deepseek",
                    {"mode": mode, "messages": history},
                    lambda: chat_with_deepseek(api_key, mode, history),
                )
            except RuntimeError as e:
                return jsonify({"error": str(e)}), 502

            debater_storage.add_messages(sid, [
                {"role": "user", "content": message, "audio_url": None},
                {
                    "role": "assistant",
                    "content": result["text"],
                    "audio_url": result.get("audio_url"),
                },
            ])

            return jsonify({
                "session_id": sid,
                "text": result["text"],
                "audio_url": result.get("audio_url"),
            })

        # ── COZE provider (original flow) ────────────────────────
        if not bot_id and not is_hosted():
            return jsonify({"error": "Bot ID is required"}), 400

        sid = debater_storage.get_or_create(session_id, mode=mode, bot_id=bot_id)

        if debater_storage.is_full(sid):
            return jsonify({"error": "Session message limit reached (100)"}), 400

        conversation_id = debater_storage.get_conversation_id(sid)
        try:
            result = run_ai(
                "debater_chat_coze",
                {"mode": mode, "message": message, "conversation_id": conversation_id},
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
        debater_storage.add_messages(sid, [
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
            debater_storage.set_conversation_id(sid, conv_id)

        return jsonify({
            "session_id": sid,
            "text": result["text"],
            "audio_url": result.get("audio_url"),
        })

    @app.route("/api/debater/score", methods=["POST"])
    def debater_score():
        """Score a full conversation using DeepSeek analysis.

        Body: {
            api_key: str,
            session_id: str
        }
        Returns: { grammar, vocabulary, logic, fluency, suggestions }
        """
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Request body must be JSON"}), 400

        api_key = data.get("api_key", "").strip()
        session_id = data.get("session_id", "").strip()

        if not api_key and not is_hosted():
            return jsonify({"error": "api_key is required"}), 400
        if not session_id:
            return jsonify({"error": "session_id is required"}), 400

        # Get messages from session
        messages = debater_storage.get_messages_for_scoring(session_id)
        if messages is None:
            return jsonify({"error": "Session not found"}), 404

        if len(messages) == 0:
            return jsonify({"error": "Session has no messages to score"}), 400

        # Run scoring
        try:
            result = run_ai(
                "debater_score",
                {"messages": messages},
                lambda: score_conversation(api_key, messages),
            )
        except RuntimeError as e:
            return jsonify({"error": str(e)}), 502

        return jsonify(result)

    @app.route("/api/debater/sessions", methods=["GET"])
    def debater_list_sessions():
        """Return all sessions (metadata only)."""
        return jsonify({"sessions": debater_storage.list_all()})

    @app.route("/api/debater/session", methods=["GET"])
    def debater_get_session():
        """Return a single session with full message history.

        Query: ?session_id=xxx
        """
        session_id = request.args.get("session_id", "").strip()
        if not session_id:
            return jsonify({"error": "session_id query parameter is required"}), 400
        s = debater_storage.get_full(session_id)
        if not s:
            return jsonify({"error": "Session not found"}), 404
        return jsonify(s)

    @app.route("/api/debater/session", methods=["DELETE"])
    def debater_delete_session():
        """Delete a session.

        Query: ?session_id=xxx
        """
        session_id = request.args.get("session_id", "").strip()
        if not session_id:
            return jsonify({"error": "session_id query parameter is required"}), 400
        if debater_storage.delete(session_id):
            return jsonify({"status": "deleted"})
        return jsonify({"error": "Session not found"}), 404
