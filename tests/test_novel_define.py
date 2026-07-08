"""Tests for the Novel vocabulary lookup endpoint (Task 5).

GET /api/novel/define?word=xxx&api_key=xxx&context=xxx

Uses DeepSeek to return {phonetic, definition_en, definition_zh}.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import pytest
from unittest.mock import patch, MagicMock
from app import create_app


@pytest.fixture
def client():
    app = create_app()
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


# ── Unit tests for quick_define() ────────────────────────────────

class TestQuickDefine:
    """Unit tests for quick_define() in translator.py using mocked OpenAI."""

    def test_quick_define_returns_expected_fields(self):
        """quick_define() returns dict with phonetic, definition_en, definition_zh."""
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content='{"phonetic": "/tɛst/", "definition_en": "a procedure for critical evaluation", "definition_zh": "测试", "example_sentence": "The test was difficult."}'))
        ]

        with patch('systems.novel.translator.OpenAI') as mock_openai:
            mock_instance = MagicMock()
            mock_instance.chat.completions.create.return_value = mock_response
            mock_openai.return_value = mock_instance

            from systems.novel.translator import quick_define
            result = quick_define("sk-test-key", "test", "This is a test.")

            assert "phonetic" in result
            assert "definition_en" in result
            assert "definition_zh" in result
            assert result["phonetic"] == "/tɛst/"
            assert result["definition_en"] == "a procedure for critical evaluation"
            assert result["definition_zh"] == "测试"

    def test_quick_define_without_context(self):
        """quick_define() works without context parameter."""
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content='{"phonetic": "/hɛˈloʊ/", "definition_en": "used as a greeting", "definition_zh": "你好", "example_sentence": "Hello, how are you?"}'))
        ]

        with patch('systems.novel.translator.OpenAI') as mock_openai:
            mock_instance = MagicMock()
            mock_instance.chat.completions.create.return_value = mock_response
            mock_openai.return_value = mock_instance

            from systems.novel.translator import quick_define
            result = quick_define("sk-test-key", "hello")

            assert result["phonetic"] == "/hɛˈloʊ/"
            assert result["definition_en"] == "used as a greeting"
            assert result["definition_zh"] == "你好"

    def test_quick_define_handles_markdown_json_response(self):
        """quick_define() parses JSON from markdown code fences."""
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content='```json\n{"phonetic": "/ˈsæm.pəl/", "definition_en": "a small part", "definition_zh": "样本", "example_sentence": "This is a sample."}\n```'))
        ]

        with patch('systems.novel.translator.OpenAI') as mock_openai:
            mock_instance = MagicMock()
            mock_instance.chat.completions.create.return_value = mock_response
            mock_openai.return_value = mock_instance

            from systems.novel.translator import quick_define
            result = quick_define("sk-test-key", "sample")

            assert result["phonetic"] == "/ˈsæm.pəl/"
            assert result["definition_en"] == "a small part"
            assert result["definition_zh"] == "样本"

    def test_quick_define_handles_invalid_json_gracefully(self):
        """quick_define() returns fallback on unparseable response."""
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content="Sorry, I cannot process that request."))
        ]

        with patch('systems.novel.translator.OpenAI') as mock_openai:
            mock_instance = MagicMock()
            mock_instance.chat.completions.create.return_value = mock_response
            mock_openai.return_value = mock_instance

            from systems.novel.translator import quick_define
            result = quick_define("sk-test-key", "xyzzy")

            assert "phonetic" in result
            assert "definition_en" in result
            assert "definition_zh" in result
            # Should be the fallback values
            assert "xyzzy" in result["definition_en"]


# ── Integration tests for the define endpoint ────────────────────

class TestNovelDefineEndpoint:
    """HTTP-level tests for GET /api/novel/define."""

    def test_define_missing_word_returns_400(self, client):
        """GET /api/novel/define without word returns 400."""
        resp = client.get('/api/novel/define?api_key=sk-test')
        assert resp.status_code == 400
        data = resp.get_json()
        assert 'word' in data['error'].lower()

    def test_define_missing_api_key_returns_400(self, client):
        """GET /api/novel/define without api_key returns 400."""
        resp = client.get('/api/novel/define?word=test')
        assert resp.status_code == 400
        data = resp.get_json()
        assert 'api_key' in data['error'].lower()

    def test_define_with_mocked_deepseek_returns_definition(self, client):
        """GET /api/novel/define returns structured definition."""
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content='{"phonetic": "/əˈbændən/", "definition_en": "to leave completely", "definition_zh": "抛弃", "example_sentence": "He abandoned the project."}'))
        ]

        with patch('systems.novel.translator.OpenAI') as mock_openai:
            mock_instance = MagicMock()
            mock_instance.chat.completions.create.return_value = mock_response
            mock_openai.return_value = mock_instance

            resp = client.get('/api/novel/define?word=abandon&api_key=sk-test&context=He%20left.')
            assert resp.status_code == 200
            data = resp.get_json()
            assert data['phonetic'] == "/əˈbændən/"
            assert data['definition_en'] == "to leave completely"
            assert data['definition_zh'] == "抛弃"

    def test_define_with_context_preserves_context(self, client):
        """GET /api/novel/define passes context through to DeepSeek."""
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content='{"phonetic": "", "definition_en": "test", "definition_zh": "测试", "example_sentence": ""}'))
        ]

        with patch('systems.novel.translator.OpenAI') as mock_openai:
            mock_instance = MagicMock()
            mock_instance.chat.completions.create.return_value = mock_response
            mock_openai.return_value = mock_instance

            resp = client.get('/api/novel/define?word=test&api_key=sk-test&context=some%20context%20here')
            assert resp.status_code == 200

            # Verify context was passed to the API call
            call_args = mock_instance.chat.completions.create.call_args
            user_message = call_args[1]['messages'][1]['content']
            assert 'some context here' in user_message
