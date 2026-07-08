"""Diary subsystem routes.

POST /api/diary/submit  — grade and save a diary entry (DeepSeek)
GET  /api/diary/entries — list diary entries with date range filter
GET  /api/diary/streak  — compute consecutive-day streak
"""

import traceback
from flask import request, jsonify
from systems.diary.grader import grade_entry
from systems.diary.session_storage import diary_storage


def register_diary_routes(app):
    """Register Diary subsystem routes on the Flask app."""

    @app.route("/api/diary/submit", methods=["POST"])
    def diary_submit():
        """Grade a diary entry and save it.

        Body: {
            api_key: str,    # DeepSeek API key (from frontend, never persisted)
            text: str,       # The diary entry text
            date: str,       # Optional ISO date (defaults to today)
        }

        Returns: { corrections, score, highlighted_expressions, date, created_at }
        """
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Request body must be JSON"}), 400

        api_key = (data.get("api_key", "") or "").strip()
        text = (data.get("text", "") or "").strip()
        entry_date = (data.get("date", "") or "").strip()

        if not api_key:
            return jsonify({"error": "API Key is required"}), 400
        if not text:
            return jsonify({"error": "Diary text is required"}), 400

        # Default date to today
        if not entry_date:
            from datetime import date
            entry_date = date.today().isoformat()

        try:
            result = grade_entry(api_key, text, entry_date)
        except RuntimeError as e:
            return jsonify({"error": str(e)}), 502
        except Exception as e:
            traceback.print_exc()
            return jsonify({"error": f"Grading failed: {str(e)}"}), 500

        # Persist the entry
        entry = {
            "date": entry_date,
            "original": text,
            "corrections": result.get("corrections", []),
            "score": result.get("score", {"grammar": 0, "vocabulary": 0, "fluency": 0}),
            "highlighted_expressions": result.get("highlighted_expressions", []),
        }
        saved = diary_storage.save_entry(entry)

        return jsonify(saved)

    @app.route("/api/diary/entries", methods=["GET"])
    def diary_get_entries():
        """List diary entries, optionally filtered by date range.

        Query params:
            from: ISO date string (inclusive)
            to:   ISO date string (inclusive)
        """
        from_date = request.args.get("from", "").strip() or None
        to_date = request.args.get("to", "").strip() or None

        entries = diary_storage.get_entries(from_date=from_date, to_date=to_date)
        return jsonify({"entries": entries})

    @app.route("/api/diary/streak", methods=["GET"])
    def diary_get_streak():
        """Return the current consecutive-day streak.

        Returns: { current_streak: int, streak_dates: [str] }
        """
        return jsonify(diary_storage.compute_streak())
