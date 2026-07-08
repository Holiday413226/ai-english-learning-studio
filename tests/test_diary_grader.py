"""Tests for Diary subsystem — grader, router, and session_storage."""
import sys
import os
import json
import tempfile
import shutil

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import pytest
from app import create_app
from systems.diary.grader import grade_entry
from systems.diary.session_storage import DiarySessionStorage


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def client():
    app = create_app()
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


# ── Grader tests (unit) ──────────────────────────────────────────────────────

class TestDiaryGrader:

    SAMPLE_RESPONSE = json.dumps({
        "corrections": [
            {
                "sentence": "I go to park yesterday",
                "issues": [
                    {"original": "go", "suggestion": "went", "reason": "Past tense required"},
                    {"original": "park", "suggestion": "the park", "reason": "Missing article"}
                ]
            },
            {
                "sentence": "It was very fun",
                "issues": [
                    {"original": "very fun", "suggestion": "a lot of fun", "reason": "Collocation error"}
                ]
            }
        ],
        "score": {"grammar": 6, "vocabulary": 5, "fluency": 5},
        "highlighted_expressions": ["good phrase 1", "good phrase 2"]
    })

    def test_parse_valid_json_response(self):
        """Grader parses a valid JSON response from DeepSeek correctly."""
        result = grade_entry._parse_response(self.SAMPLE_RESPONSE)
        assert "corrections" in result
        assert "score" in result
        assert "highlighted_expressions" in result
        assert len(result["corrections"]) == 2
        assert result["score"]["grammar"] == 6
        assert result["score"]["vocabulary"] == 5
        assert result["score"]["fluency"] == 5
        assert len(result["highlighted_expressions"]) == 2

    def test_parse_json_in_markdown_fence(self):
        """Grader extracts JSON wrapped in markdown code fences."""
        raw = "```json\n" + self.SAMPLE_RESPONSE + "\n```"
        result = grade_entry._parse_response(raw)
        assert len(result["corrections"]) == 2
        assert result["score"]["grammar"] == 6

    def test_parse_fallback_on_invalid_json(self):
        """Grader returns fallback structure when JSON is invalid."""
        result = grade_entry._parse_response("not json at all")
        assert "corrections" in result
        assert "score" in result
        assert result["score"]["grammar"] == 0


# ── Session Storage tests (unit) ──────────────────────────────────────────────

class TestDiarySessionStorage:

    def setup_method(self):
        self.tmpdir = tempfile.mkdtemp()
        self.storage = DiarySessionStorage(data_dir=self.tmpdir)

    def teardown_method(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_save_and_load_entry(self):
        entry = {
            "date": "2026-07-07",
            "original": "I go to park yesterday.",
            "corrections": [],
            "score": {"grammar": 6, "vocabulary": 5, "fluency": 5},
            "highlighted_expressions": [],
        }
        saved = self.storage.save_entry(entry)
        assert saved["date"] == "2026-07-07"
        assert saved["created_at"] is not None

        loaded = self.storage.get_entries()
        assert len(loaded) == 1
        assert loaded[0]["original"] == "I go to park yesterday."

    def test_save_entry_overwrites_same_date(self):
        """Submitting on the same date overwrites the previous entry."""
        e1 = {"date": "2026-07-07", "original": "First entry.",
              "corrections": [], "score": {"grammar": 0, "vocabulary": 0, "fluency": 0},
              "highlighted_expressions": []}
        e2 = {"date": "2026-07-07", "original": "Second entry.",
              "corrections": [], "score": {"grammar": 0, "vocabulary": 0, "fluency": 0},
              "highlighted_expressions": []}

        self.storage.save_entry(e1)
        self.storage.save_entry(e2)

        entries = self.storage.get_entries()
        assert len(entries) == 1
        assert entries[0]["original"] == "Second entry."

    def test_get_entries_by_date_range(self):
        """get_entries supports from_date and to_date filtering."""
        for d in ["2026-07-05", "2026-07-06", "2026-07-07"]:
            self.storage.save_entry({
                "date": d, "original": f"Entry for {d}",
                "corrections": [], "score": {"grammar": 0, "vocabulary": 0, "fluency": 0},
                "highlighted_expressions": [],
            })

        mid = self.storage.get_entries(from_date="2026-07-05", to_date="2026-07-06")
        assert len(mid) == 2

        single = self.storage.get_entries(from_date="2026-07-07", to_date="2026-07-07")
        assert len(single) == 1

    def test_compute_streak_continuous_no_gap(self):
        """Streak counts consecutive days ending today (or yesterday)."""
        from datetime import date, timedelta

        today = date.today()
        for i in reversed(range(5)):
            d = (today - timedelta(days=i)).isoformat()
            self.storage.save_entry({
                "date": d, "original": f"Entry {i}",
                "corrections": [], "score": {"grammar": 0, "vocabulary": 0, "fluency": 0},
                "highlighted_expressions": [],
            })

        result = self.storage.compute_streak()
        assert result["current_streak"] == 5
        assert len(result["streak_dates"]) == 5

    def test_compute_streak_with_gap(self):
        """A gap of more than one day resets the streak."""
        from datetime import date, timedelta

        today = date.today()
        # Write entries for today, yesterday, and 4 days ago (gap)
        self.storage.save_entry({
            "date": today.isoformat(), "original": "Today",
            "corrections": [], "score": {"grammar": 0, "vocabulary": 0, "fluency": 0},
            "highlighted_expressions": [],
        })
        self.storage.save_entry({
            "date": (today - timedelta(days=1)).isoformat(), "original": "Yesterday",
            "corrections": [], "score": {"grammar": 0, "vocabulary": 0, "fluency": 0},
            "highlighted_expressions": [],
        })
        self.storage.save_entry({
            "date": (today - timedelta(days=4)).isoformat(), "original": "Old",
            "corrections": [], "score": {"grammar": 0, "vocabulary": 0, "fluency": 0},
            "highlighted_expressions": [],
        })

        result = self.storage.compute_streak()
        # The streak should be 2 (today + yesterday), since 4 days ago is separated by a gap
        assert result["current_streak"] == 2

    def test_compute_streak_empty(self):
        """When no entries exist, streak is 0."""
        result = self.storage.compute_streak()
        assert result["current_streak"] == 0
        assert result["streak_dates"] == []


# ── HTTP endpoint tests (integration) ─────────────────────────────────────────

class TestDiaryAPI:

    def test_submit_missing_api_key(self, client):
        resp = client.post('/api/diary/submit', json={
            'text': 'I go to park yesterday.',
        })
        assert resp.status_code == 400
        data = resp.get_json()
        assert 'api_key' in data['error'].lower() or 'api' in data['error'].lower()

    def test_submit_missing_text(self, client):
        resp = client.post('/api/diary/submit', json={
            'api_key': 'sk-test',
        })
        assert resp.status_code == 400
        assert 'text' in resp.get_json()['error'].lower()

    def test_get_entries_empty(self, client):
        resp = client.get('/api/diary/entries')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['entries'] == []

    def test_get_streak_empty(self, client):
        resp = client.get('/api/diary/streak')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['current_streak'] == 0
        assert data['streak_dates'] == []
