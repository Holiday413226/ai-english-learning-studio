"""Map gateway op names to the app's existing AI engines.

The gateway injects the developer's real credentials from environment
variables (set on the server), so the desktop client never sees them.
Each op mirrors an engine call already made by the local Flask routers,
with the same parameter shapes and return dicts.
"""

import os

from core.coze_client import chat_with_bot
from systems.novel.translator import translate, quick_define
from systems.diary.grader import grade_entry
from systems.debater.deepseek_client import chat_with_deepseek
from systems.debater.scorer import score_conversation
from systems.vocab.ai_definer import define_word


def _deepseek_key() -> str:
    return os.environ.get("AIES_DEEPSEEK_API_KEY", "").strip()


def _coze_key() -> str:
    return os.environ.get("AIES_COZE_API_KEY", "").strip()


def _coze_url() -> str | None:
    return os.environ.get("AIES_COZE_API_URL", "").strip() or None


def _debate_bot(mode: str) -> str:
    key = "AIES_DISCUSS_BOT_ID" if mode == "discuss" else "AIES_DEBATE_BOT_ID"
    return os.environ.get(key, "").strip()


def op_novel_translate(params: dict) -> dict:
    return translate(
        _deepseek_key(),
        params.get("novel_text", ""),
        params.get("vocab_list", []),
    )


def op_novel_define(params: dict) -> dict:
    return quick_define(_deepseek_key(), params.get("word", ""), params.get("context", ""))


def op_diary_grade(params: dict) -> dict:
    return grade_entry(_deepseek_key(), params.get("text", ""), params.get("date"))


def op_debater_chat_deepseek(params: dict) -> dict:
    return chat_with_deepseek(
        _deepseek_key(),
        params.get("mode", "debate"),
        params.get("messages", []),
    )


def op_debater_chat_coze(params: dict) -> dict:
    return chat_with_bot(
        api_key=_coze_key(),
        bot_id=_debate_bot(params.get("mode", "debate")),
        user_message=params.get("message", ""),
        conversation_id=params.get("conversation_id"),
        api_url=_coze_url(),
    )


def op_debater_score(params: dict) -> dict:
    return score_conversation(_deepseek_key(), params.get("messages", []))


def op_vocab_define(params: dict) -> dict:
    return define_word(_deepseek_key(), params.get("word", ""), params.get("context", ""))


def op_minecraft_chat_coze(params: dict) -> dict:
    return chat_with_bot(
        api_key=_coze_key(),
        bot_id=os.environ.get("AIES_MINECRAFT_BOT_ID", "").strip(),
        user_message=params.get("message", ""),
        conversation_id=params.get("conversation_id"),
        api_url=_coze_url(),
    )


def chat_completions(payload: dict) -> dict:
    """OpenAI-compatible chat completion, forwarding to DeepSeek.

    The Minebot (Mindcraft) Node process uses the OpenAI SDK with
    ``baseURL = {gateway}/v1`` and ``apiKey = <activation code>``, so its
    calls land here as standard ``chat.completions`` requests.  We inject the
    server-side DeepSeek key and return an OpenAI-shaped response so the SDK
    parses it transparently.
    """
    from openai import OpenAI

    base_url = os.environ.get("AIES_DEEPSEEK_API_BASE", "https://api.deepseek.com/v1")
    client = OpenAI(api_key=_deepseek_key(), base_url=base_url)

    kwargs = {
        "model": payload.get("model") or "deepseek-v4-pro",
        "messages": payload.get("messages") or [],
    }
    for k in ("temperature", "max_tokens", "top_p", "frequency_penalty", "presence_penalty", "stop"):
        if k in payload and payload[k] is not None:
            kwargs[k] = payload[k]

    resp = client.chat.completions.create(**kwargs)
    choice = resp.choices[0]
    usage = getattr(resp, "usage", None)

    return {
        "id": getattr(resp, "id", ""),
        "object": "chat.completion",
        "created": getattr(resp, "created", 0),
        "model": getattr(resp, "model", kwargs["model"]),
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": (choice.message.content or "")},
                "finish_reason": getattr(choice, "finish_reason", "stop") or "stop",
            }
        ],
        "usage": (
            {
                "prompt_tokens": getattr(usage, "prompt_tokens", 0),
                "completion_tokens": getattr(usage, "completion_tokens", 0),
                "total_tokens": getattr(usage, "total_tokens", 0),
            }
            if usage
            else None
        ),
    }


OPS = {
    "novel_translate": op_novel_translate,
    "novel_define": op_novel_define,
    "diary_grade": op_diary_grade,
    "debater_chat_deepseek": op_debater_chat_deepseek,
    "debater_chat_coze": op_debater_chat_coze,
    "debater_score": op_debater_score,
    "vocab_define": op_vocab_define,
    "minecraft_chat_coze": op_minecraft_chat_coze,
}
