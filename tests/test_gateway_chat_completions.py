"""Tests for the OpenAI-compatible /v1/chat/completions endpoint (Minebot)."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'gateway'))

import pytest
from unittest.mock import patch, MagicMock


@pytest.fixture
def gw(monkeypatch, tmp_path):
    import auth
    import audit
    import gateway_server

    monkeypatch.setattr(auth, "DB_PATH", str(tmp_path / "codes.db"))
    monkeypatch.setattr(audit, "LOG_PATH", str(tmp_path / "usage.log"))

    gapp = gateway_server.create_app()
    gapp.config["TESTING"] = True
    yield gapp, tmp_path


OPENAI_SHAPE = {
    "id": "chatcmpl-1",
    "object": "chat.completion",
    "created": 1,
    "model": "deepseek-v4-pro",
    "choices": [{"index": 0, "message": {"role": "assistant", "content": "hi"}, "finish_reason": "stop"}],
    "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
}


def _post(client, code, body):
    return client.post(
        "/v1/chat/completions",
        json=body,
        headers={"Authorization": f"Bearer {code}"},
    )


def test_valid_code_returns_openai_shape(gw):
    import auth

    gapp, _ = gw
    code = auth.create_codes(1)[0]
    payload = {"model": "deepseek-v4-pro", "messages": [{"role": "user", "content": "hi"}]}

    with patch("ops.chat_completions", return_value=OPENAI_SHAPE) as m:
        with gapp.test_client() as c:
            resp = _post(c, code, payload)

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["choices"][0]["message"]["content"] == "hi"
    m.assert_called_once_with(payload)


def test_invalid_code_returns_401(gw):
    gapp, _ = gw
    with gapp.test_client() as c:
        resp = _post(c, "AIES-NOPE-NOPE-NOPE-NOPE", {"messages": []})
    assert resp.status_code == 401
    assert "error" in resp.get_json()


def test_missing_code_returns_401(gw):
    gapp, _ = gw
    with gapp.test_client() as c:
        resp = c.post("/v1/chat/completions", json={"messages": []})
    assert resp.status_code == 401


def test_ops_chat_completions_injects_key(monkeypatch):
    import ops

    monkeypatch.setenv("AIES_DEEPSEEK_API_KEY", "sk-test")

    fake_resp = MagicMock()
    fake_resp.id = "cmpl-1"
    fake_resp.created = 123
    fake_resp.model = "deepseek-v4-pro"
    fake_resp.usage = MagicMock(prompt_tokens=1, completion_tokens=1, total_tokens=2)
    fake_resp.choices = [MagicMock()]
    fake_resp.choices[0].message.content = "hello"
    fake_resp.choices[0].finish_reason = "stop"

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = fake_resp

    with patch("openai.OpenAI", return_value=mock_client) as mock_openai:
        result = ops.chat_completions(
            {"model": "deepseek-v4-pro", "messages": [{"role": "user", "content": "hi"}]}
        )

    assert result["choices"][0]["message"]["content"] == "hello"
    assert result["choices"][0]["finish_reason"] == "stop"

    _, kwargs = mock_openai.call_args
    assert kwargs["api_key"] == "sk-test"
    assert kwargs["base_url"] == "https://api.deepseek.com/v1"
