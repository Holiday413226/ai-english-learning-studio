"""Tests for the Debater chat provider branch (DeepSeek vs COZE)."""
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


class TestChatWithDeepSeek:
    """Unit tests for deepseek_client.chat_with_deepseek."""

    @patch("systems.debater.deepseek_client.OpenAI")
    def test_returns_text_and_null_metadata(self, mock_openai):
        from systems.debater.deepseek_client import chat_with_deepseek

        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content="  I disagree.  "))
        ]
        mock_client.chat.completions.create.return_value = mock_response

        result = chat_with_deepseek(
            "sk-test", "debate", [{"role": "user", "content": "AI is good"}]
        )

        assert result["text"] == "I disagree."
        assert result["audio_url"] is None
        assert result["conversation_id"] is None

    @patch("systems.debater.deepseek_client.OpenAI")
    def test_injects_mode_system_prompt(self, mock_openai):
        from systems.debater.deepseek_client import chat_with_deepseek, PROMPTS

        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content="ok"))]
        mock_client.chat.completions.create.return_value = mock_response

        chat_with_deepseek(
            "sk-test", "discuss", [{"role": "user", "content": "hi"}]
        )

        _, kwargs = mock_client.chat.completions.create.call_args
        sent_messages = kwargs["messages"]
        assert sent_messages[0]["role"] == "system"
        assert sent_messages[0]["content"] == PROMPTS["discuss"]
        assert sent_messages[-1] == {"role": "user", "content": "hi"}

    @patch("systems.debater.deepseek_client.OpenAI")
    def test_raises_runtime_error_on_failure(self, mock_openai):
        from systems.debater.deepseek_client import chat_with_deepseek

        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("boom")

        with pytest.raises(RuntimeError, match="DeepSeek chat failed"):
            chat_with_deepseek(
                "sk-test", "debate", [{"role": "user", "content": "hi"}]
            )


class TestDebaterChatProvider:
    """Integration tests for POST /api/debater/chat provider branching."""

    @patch("systems.debater.router.chat_with_deepseek")
    def test_deepseek_missing_key_returns_400(self, mock_chat, client):
        resp = client.post('/api/debater/chat', json={
            'provider': 'deepseek',
            'message': 'hello',
            'mode': 'debate',
        })
        assert resp.status_code == 400
        assert 'deepseek' in resp.get_json()['error'].lower()

    @patch("systems.debater.router.chat_with_deepseek")
    def test_deepseek_returns_reply(self, mock_chat, client):
        from systems.debater.session_storage import debater_storage
        mock_chat.return_value = {
            "text": "I disagree.", "audio_url": None, "conversation_id": None,
        }

        resp = client.post('/api/debater/chat', json={
            'provider': 'deepseek',
            'api_key': 'sk-test',
            'message': 'AI is good',
            'mode': 'debate',
        })

        assert resp.status_code == 200
        data = resp.get_json()
        assert data["text"] == "I disagree."
        assert data["audio_url"] is None

        # The new user message should be included in the history sent to DeepSeek.
        # Router calls chat_with_deepseek(api_key, mode, history) positionally.
        args, _ = mock_chat.call_args
        assert args[1] == "debate"
        assert args[2][-1] == {"role": "user", "content": "AI is good"}

        debater_storage.delete(data["session_id"])

    def test_coze_missing_bot_id_returns_400(self, client):
        resp = client.post('/api/debater/chat', json={
            'provider': 'coze',
            'api_key': 'coze-key',
            'message': 'hello',
            'mode': 'debate',
        })
        assert resp.status_code == 400
        assert 'bot id' in resp.get_json()['error'].lower()

    @patch("systems.debater.router.chat_with_bot")
    def test_coze_returns_reply(self, mock_chat, client):
        from systems.debater.session_storage import debater_storage
        mock_chat.return_value = {
            "text": "Hi!", "audio_url": "http://x/a.mp3", "conversation_id": "conv1",
        }

        resp = client.post('/api/debater/chat', json={
            'provider': 'coze',
            'api_key': 'coze-key',
            'bot_id': 'bot-1',
            'message': 'hello',
            'mode': 'discuss',
        })

        assert resp.status_code == 200
        data = resp.get_json()
        assert data["text"] == "Hi!"
        assert data["audio_url"] == "http://x/a.mp3"

        debater_storage.delete(data["session_id"])

    def test_invalid_provider_returns_400(self, client):
        resp = client.post('/api/debater/chat', json={
            'provider': 'openai',
            'api_key': 'k',
            'message': 'hi',
            'mode': 'debate',
        })
        assert resp.status_code == 400
