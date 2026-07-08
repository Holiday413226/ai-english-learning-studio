"""Vocab Vault subsystem routes.

POST   /api/vocab/add         — add a word (with AI definition)
GET    /api/vocab/list         — list all words
DELETE /api/vocab/word         — delete a word
POST   /api/vocab/review       — SM-2 review feedback
GET    /api/vocab/quiz         — generate quiz
GET    /api/vocab/export       — CSV export
GET    /api/vocab/stats        — aggregate statistics
GET    /api/vocab/due          — words due for review
"""

from flask import request, jsonify, Response
from systems.vocab.vault import vocab_vault
from systems.vocab.ai_definer import define_word


def register_vocab_routes(app):
    """Register Vocab Vault routes on the Flask app."""

    @app.route("/api/vocab/add", methods=["POST"])
    def vocab_add():
        """Add a word to the vault. Optionally generates AI definition."""
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Request body must be JSON"}), 400

        word = data.get("word", "").strip()
        source_module = data.get("source_module", "").strip()
        context = data.get("context", "").strip()
        api_key = data.get("api_key", "").strip()

        if not word:
            return jsonify({"error": "'word' is required"}), 400
        if source_module not in ("novel", "diary", "debater", "minecraft"):
            return jsonify({"error": "source_module must be one of: novel, diary, debater, minecraft"}), 400

        definition_en = definition_zh = phonetic = example_sentence = ""
        if api_key:
            try:
                definition = define_word(api_key, word, context)
                phonetic = definition.get("phonetic", "")
                definition_en = definition.get("definition_en", "")
                definition_zh = definition.get("definition_zh", "")
                example_sentence = definition.get("example_sentence", context)
            except RuntimeError as e:
                return jsonify({"error": str(e)}), 502

        entry = vocab_vault.add_word(
            word=word,
            source_module=source_module,
            source_context=context,
            definition_en=definition_en,
            definition_zh=definition_zh,
            phonetic=phonetic,
            example_sentence=example_sentence,
        )

        return jsonify(entry)

    @app.route("/api/vocab/list", methods=["GET"])
    def vocab_list():
        """List words with optional filtering and sorting."""
        sort_by = request.args.get("sort_by", "created_at")
        order = request.args.get("order", "desc")
        limit = request.args.get("limit", type=int)
        module_filter = request.args.get("module")

        if sort_by not in ("created_at", "word", "next_review", "review_count"):
            sort_by = "created_at"
        if order not in ("asc", "desc"):
            order = "desc"

        words = vocab_vault.list_words(
            sort_by=sort_by,
            order=order,
            limit=limit,
            module_filter=module_filter,
        )
        return jsonify({"words": words, "total": len(words)})

    @app.route("/api/vocab/word", methods=["DELETE"])
    def vocab_delete_word():
        """Delete a word. Query: ?word=xxx"""
        word = request.args.get("word", "").strip()
        if not word:
            return jsonify({"error": "'word' query parameter is required"}), 400
        if vocab_vault.delete_word(word):
            return jsonify({"status": "deleted"})
        return jsonify({"error": "Word not found"}), 404

    @app.route("/api/vocab/review", methods=["POST"])
    def vocab_review():
        """Record a flashcard review result (SM-2)."""
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Request body must be JSON"}), 400

        word = data.get("word", "").strip()
        quality = data.get("quality", -1)

        if not word:
            return jsonify({"error": "'word' is required"}), 400
        if not isinstance(quality, int) or quality < 0 or quality > 5:
            return jsonify({"error": "'quality' must be integer 0-5"}), 400

        try:
            result = vocab_vault.review_word(word, quality)
        except KeyError:
            return jsonify({"error": f"Word '{word}' not in vault"}), 404

        return jsonify(result)

    @app.route("/api/vocab/quiz", methods=["GET"])
    def vocab_quiz():
        """Generate a multiple-choice quiz."""
        count = request.args.get("count", 10, type=int)
        count = min(max(count, 1), 50)
        questions = vocab_vault.generate_quiz(count=count)
        return jsonify({"questions": questions, "total": len(questions)})

    @app.route("/api/vocab/export", methods=["GET"])
    def vocab_export():
        """Export all words as CSV."""
        csv_data = vocab_vault.export_csv()
        return Response(
            csv_data,
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=vocab_vault.csv"},
        )

    @app.route("/api/vocab/stats", methods=["GET"])
    def vocab_stats():
        """Return aggregate statistics."""
        return jsonify(vocab_vault.get_stats())

    @app.route("/api/vocab/due", methods=["GET"])
    def vocab_due():
        """Return words due for review (SM-2)."""
        limit = request.args.get("limit", 20, type=int)
        due = vocab_vault.words_due_for_review(limit=limit)
        return jsonify({"words": due, "total": len(due)})
