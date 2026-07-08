"""Tests for Debater scoring endpoint — AI-powered conversation analysis."""
import pytest
import sys
import os
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app import create_app


@pytest.fixture
def app():
    app = create_app()
    app.config['TESTING'] = True
    return app


@pytest.fixture
def client(app):
    with app.test_client() as c:
        yield c


class TestDebaterScorer:
    """Unit tests for the scorer module."""

    @patch("systems.debater.scorer.OpenAI")
    def test_score_returns_all_dimensions(self, mock_openai):
        """score_conversation should return all four dimensions and suggestions."""
        from systems.debater.scorer import score_conversation

        # Setup mock response
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content='{"grammar": 7, "vocabulary": 6, "logic": 8, "fluency": 7, "suggestions": ["Use more varied vocabulary", "Work on transitions"]}'))
        ]
        mock_client.chat.completions.create.return_value = mock_response

        messages = [
            {"role": "user", "content": "I thinks this is good."},
            {"role": "assistant", "content": "I disagree because..."},
        ]

        result = score_conversation("sk-test", messages)

        assert result["grammar"] == 7
        assert result["vocabulary"] == 6
        assert result["logic"] == 8
        assert result["fluency"] == 7
        assert len(result["suggestions"]) == 2

    @patch("systems.debater.scorer.OpenAI")
    def test_score_cleans_markdown_wrappers(self, mock_openai):
        """score_conversation should strip ```json wrappers from response."""
        from systems.debater.scorer import score_conversation

        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content='```json\n{"grammar": 5, "vocabulary": 5, "logic": 5, "fluency": 5, "suggestions": ["a"]}\n```'))
        ]
        mock_client.chat.completions.create.return_value = mock_response

        messages = [{"role": "user", "content": "hi"}]
        result = score_conversation("sk-test", messages)

        assert result["grammar"] == 5
        assert result["vocabulary"] == 5

    @patch("systems.debater.scorer.OpenAI")
    def test_score_handles_api_errors(self, mock_openai):
        """score_conversation should raise RuntimeError on API failure."""
        from systems.debater.scorer import score_conversation

        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("Connection refused")

        messages = [{"role": "user", "content": "test"}]

        with pytest.raises(RuntimeError, match="Scoring failed"):
            score_conversation("sk-test", messages)


class TestDebaterScoreEndpoint:
    """Integration tests for POST /api/debater/score."""

    def test_score_missing_api_key_returns_400(self, client):
        """Score endpoint requires api_key."""
        resp = client.post('/api/debater/score', json={
            'session_id': 'test-session',
        })
        assert resp.status_code == 400
        data = resp.get_json()
        assert 'api_key' in data['error'].lower()

    def test_score_missing_session_id_returns_400(self, client):
        """Score endpoint requires session_id."""
        resp = client.post('/api/debater/score', json={
            'api_key': 'sk-test',
        })
        assert resp.status_code == 400
        data = resp.get_json()
        assert 'session_id' in data['error'].lower()

    def test_score_invalid_session_returns_404(self, client):
        """Scoring a nonexistent session returns 404."""
        resp = client.post('/api/debater/score', json={
            'api_key': 'sk-test',
            'session_id': 'nonexistent-session-id-12345',
        })
        assert resp.status_code == 404

    @patch("systems.debater.router.score_conversation")
    def test_score_valid_session_returns_scoring(self, mock_score, client):
        """Scoring a valid session returns the scoring dict."""
        mock_score.return_value = {
            "grammar": 8,
            "vocabulary": 7,
            "logic": 6,
            "fluency": 9,
            "suggestions": ["Improve logical structure", "Use more advanced vocabulary"],
        }

        # First create a session with some messages
        from systems.debater.session_storage import debater_storage
        sid = debater_storage.create(mode="debate", bot_id="bot123")
        debater_storage.add_messages(sid, [
            {"role": "user", "content": "I think AI is good"},
            {"role": "assistant", "content": "AI has both benefits and risks"},
        ])

        resp = client.post('/api/debater/score', json={
            'api_key': 'sk-test-key',
            'session_id': sid,
        })

        assert resp.status_code == 200
        data = resp.get_json()
        assert data["grammar"] == 8
        assert data["vocabulary"] == 7
        assert data["logic"] == 6
        assert data["fluency"] == 9
        assert isinstance(data["suggestions"], list)
        assert len(data["suggestions"]) == 2

        # Clean up
        debater_storage.delete(sid)
