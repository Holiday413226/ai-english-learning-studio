"""Novel subsystem routes.

POST /api/novel/translate  — translate Chinese novel to English (DeepSeek)
GET  /api/novel/define     — quick vocabulary definition lookup (DeepSeek)
GET  /api/novel/sessions    — list translation history sessions
GET  /api/novel/session     — get session with translation history
DELETE /api/novel/session   — delete a session
"""

import traceback
from flask import request, jsonify
from systems.novel.translator import translate, quick_define
from systems.novel.session_storage import novel_storage


def register_novel_routes(app):
    """Register Novel subsystem routes on the Flask app."""

    @app.route("/api/novel/translate", methods=["POST"])
    def novel_translate():
        """Translate Chinese novel text to English.

        Body: {
            api_key: str,      # DeepSeek API key (from frontend, never persisted)
            novel_text: str,   # Chinese novel text
            vocab_text: str,   # newline-separated vocabulary words
            session_id: str,   # optional — for history tracking
        }
        """
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Request body must be JSON"}), 400

        api_key = (data.get("api_key", "") or "").strip()
        novel_text = (data.get("novel_text", "") or "").strip()
        vocab_text = (data.get("vocab_text", "") or "").strip()
        session_id = (data.get("session_id", "") or "").strip()

        if not api_key:
            return jsonify({"error": "API Key is required"}), 400
        if not novel_text:
            return jsonify({"error": "Novel text is required"}), 400

        vocab_list = []
        if vocab_text:
            vocab_list = [w.strip() for w in vocab_text.split("\n") if w.strip()]

        try:
            result = translate(api_key, novel_text, vocab_list)
        except Exception as e:
            traceback.print_exc()
            error_msg = str(e)
            if "401" in error_msg or "unauthorized" in error_msg.lower():
                return jsonify(
                    {"error": "Invalid API Key. Please check your DeepSeek API key."}
                ), 401
            if "402" in error_msg or "insufficient" in error_msg.lower():
                return jsonify(
                    {"error": "Insufficient balance. Please top up your DeepSeek account."}
                ), 402
            return jsonify({"error": f"Translation failed: {error_msg}"}), 500

        # Always save to session history for persistence
        if not session_id:
            session_id = novel_storage.create()
        novel_storage.add_message(session_id, "user", novel_text[:500])
        novel_storage.add_message(session_id, "assistant", result.get("translated_text", "")[:500])

        result["session_id"] = session_id
        return jsonify(result)

    @app.route("/api/novel/define", methods=["GET"])
    def novel_define():
        """Quick vocabulary definition lookup using DeepSeek.

        Query params:
            word    — the word to define (required)
            api_key — DeepSeek API key (required)
            context — optional sentence/context where the word appeared

        Returns:
            {phonetic, definition_en, definition_zh}
        """
        word = request.args.get("word", "").strip()
        api_key = request.args.get("api_key", "").strip()
        context = request.args.get("context", "").strip()

        if not word:
            return jsonify({"error": "'word' query parameter is required"}), 400
        if not api_key:
            return jsonify({"error": "'api_key' query parameter is required"}), 400

        try:
            result = quick_define(api_key, word, context)
        except RuntimeError as e:
            error_msg = str(e)
            if "Invalid DeepSeek API Key" in error_msg:
                return jsonify({"error": "Invalid API Key. Please check your DeepSeek API key."}), 401
            return jsonify({"error": f"Definition lookup failed: {error_msg}"}), 502

        return jsonify(result)

    @app.route("/api/novel/sessions", methods=["GET"])
    def novel_list_sessions():
        """List all Novel translation history sessions."""
        return jsonify({"sessions": novel_storage.list_all()})

    @app.route("/api/novel/session", methods=["GET"])
    def novel_get_session():
        """Get a single Novel session with full history.

        Query: ?session_id=xxx
        """
        session_id = request.args.get("session_id", "").strip()
        if not session_id:
            return jsonify({"error": "session_id query parameter is required"}), 400
        session = novel_storage.load(session_id)
        if session is None:
            return jsonify({"error": "Session not found"}), 404
        return jsonify(session)

    @app.route("/api/novel/session", methods=["DELETE"])
    def novel_delete_session():
        """Delete a Novel session.

        Query: ?session_id=xxx
        """
        session_id = request.args.get("session_id", "").strip()
        if not session_id:
            return jsonify({"error": "session_id query parameter is required"}), 400
        if novel_storage.delete(session_id):
            return jsonify({"status": "deleted"})
        return jsonify({"error": "Session not found"}), 404
