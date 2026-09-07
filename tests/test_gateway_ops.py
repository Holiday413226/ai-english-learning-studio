"""Tests for the gateway op→engine mapping (key injection, no live API calls)."""
import sys
import os
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'gateway'))

import ops


def test_ops_mapping_is_complete():
    expected = {
        "novel_translate",
        "novel_define",
        "diary_grade",
        "debater_chat_deepseek",
        "debater_chat_coze",
        "debater_score",
        "vocab_define",
        "minecraft_chat_coze",
    }
    assert set(ops.OPS) == expected


def test_op_vocab_define_injects_deepseek_key(monkeypatch):
    monkeypatch.setenv("AIES_DEEPSEEK_API_KEY", "sk-test-key")
    with patch.object(ops, "define_word", return_value={"phonetic": "həˈləʊ"}) as m:
        result = ops.op_vocab_define({"word": "hello", "context": ""})
        assert result == {"phonetic": "həˈləʊ"}
        m.assert_called_once_with("sk-test-key", "hello", "")


def test_op_debater_chat_coze_selects_discuss_bot(monkeypatch):
    monkeypatch.setenv("AIES_COZE_API_KEY", "pat-test")
    monkeypatch.setenv("AIES_DEBATE_BOT_ID", "bot-debate")
    monkeypatch.setenv("AIES_DISCUSS_BOT_ID", "bot-discuss")
    with patch.object(ops, "chat_with_bot", return_value={"text": "hi"}) as m:
        ops.op_debater_chat_coze({"mode": "discuss", "message": "hello", "conversation_id": "c1"})
        _, kwargs = m.call_args
        assert kwargs["bot_id"] == "bot-discuss"
        assert kwargs["api_key"] == "pat-test"
        assert kwargs["user_message"] == "hello"
