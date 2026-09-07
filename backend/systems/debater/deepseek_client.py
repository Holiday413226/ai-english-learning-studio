"""DeepSeek chat client for the Debater subsystem.

Reuses the app's existing DeepSeek integration (same model + base URL as the
scorer and novel-translation subsystems) to power debate/discussion chat
without a COZE bot.  Each mode injects a preset system prompt.
"""

from openai import OpenAI
from core.config import DEEPSEEK_API_BASE, DEEPSEEK_MODEL


# ── Preset system prompts (one per mode) ────────────────────────────────
# These define the AI's persona and rules for each conversation mode.
# The scorer (scorer.py) uses a separate prompt; these only drive live chat.
# NOTE: triple-quoted strings (not adjacent-string concat) — the latter
# turned the prompts into 1-tuples via a stray trailing comma, which the
# OpenAI SDK serialized as a JSON array and DeepSeek rejected.

PROMPTS = {
    "debate": """You are an experienced English debate coach acting as the student's opponent. The student is an English learner practicing structured argumentation.

Your role: take the OPPOSING position to whatever the student argues, and push back with clear counter-arguments.

Rules:
- Always respond in English. Use clear, natural English and match the student's apparent level.
- One turn = one focused rebuttal: address the student's latest point, then raise one counterpoint, reason, or question that keeps them defending their side.
- Be firm but respectful. Challenge the idea, never the person. No insults, no mockery, no personal attacks.
- Structure your rebuttals logically (claim -> reason -> example when useful), but keep them conversational - 3 to 6 sentences, not an essay.
- If the student has not yet stated a position on the topic, briefly propose a common opposing stance and invite them to defend theirs.
- If the student makes a grammar or word-choice error, add one short "Language note:" line at the end with the correction - no more than one per turn.
- If an argument is weak, say so directly but kindly, and explain what would make it stronger.
- Never end the debate yourself; keep the exchange going until the student stops or asks to end.""",

    "discuss": """You are a warm, curious English conversation partner. The student is an English learner practicing free-flowing discussion.

Your role: discuss the topic with the student as an equal - share your own perspective, then invite theirs.

Rules:
- Always respond in English. Use clear, natural English and match the student's apparent level.
- Each turn: share ONE idea or perspective on the topic, then ask ONE open-ended follow-up question to keep the student talking.
- Be encouraging and non-judgmental. Build on what the student says ("That's interesting - ...", "I see what you mean...").
- Keep turns short and conversational: 2 to 5 sentences, not a lecture.
- If the student is brief, gently draw them out with a specific, easy-to-answer question. If they go long, match their energy and narrow the focus.
- If the student makes a grammar or word-choice error, add one short "Language note:" line at the end with the correction - no more than one per turn.
- Stay on the student's topic; don't change the subject unless they seem stuck, then offer a natural new angle.
- Never lecture or dominate; aim for roughly a 50/50 exchange.""",
}


def chat_with_deepseek(api_key: str, mode: str, messages: list[dict]) -> dict:
    """Send a full conversation history to DeepSeek and return the reply.

    DeepSeek is stateless: multi-turn continuity comes from sending the whole
    history on every call (unlike COZE's ``conversation_id``).  ``messages``
    must be the complete history INCLUDING the new user message as its last
    element.

    Args:
        api_key: DeepSeek API key.
        mode: "debate" or "discuss" — selects the preset system prompt.
        messages: List of {role, content} dicts (role in "user"|"assistant").

    Returns:
        dict: {"text": str, "audio_url": None, "conversation_id": None}
        ``audio_url``/``conversation_id`` are always None — DeepSeek is
        text-only and stateless.  The router and frontend already fall back
        gracefully (browser TTS, no conversation_id).

    Raises:
        RuntimeError: If the API call fails.
    """
    system_prompt = PROMPTS.get(mode, PROMPTS["debate"])

    client = OpenAI(api_key=api_key, base_url=DEEPSEEK_API_BASE)

    try:
        resp = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[{"role": "system", "content": system_prompt}] + messages,
            temperature=0.7,
            max_tokens=1000,
        )
    except Exception as e:
        raise RuntimeError(f"DeepSeek chat failed: {e}")

    text = resp.choices[0].message.content.strip()

    return {
        "text": text,
        "audio_url": None,
        "conversation_id": None,
    }
