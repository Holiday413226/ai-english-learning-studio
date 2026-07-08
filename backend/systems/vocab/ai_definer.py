"""DeepSeek-powered word definition generator.

Given a word and optional context, returns a structured definition
suitable for Vocab Vault storage.
"""

import json
from openai import OpenAI
from core.config import DEEPSEEK_API_BASE, DEEPSEEK_MODEL


DEFINITION_PROMPT = """You are an English vocabulary tutor. Given a word and its context, generate:

1. Phonetic transcription (IPA)
2. English definition (concise, one sentence)
3. Chinese definition (精准中文释义)
4. An example sentence (using the word naturally in context)

Return ONLY valid JSON, no other text:
{
  "phonetic": "string",
  "definition_en": "string",
  "definition_zh": "string",
  "example_sentence": "string"}"""


def define_word(api_key: str, word: str, context: str = "") -> dict:
    """Generate a structured word definition using DeepSeek.

    Args:
        api_key: DeepSeek API key.
        word: The word to define.
        context: Optional sentence/context where the word appeared.

    Returns:
        dict: {phonetic, definition_en, definition_zh, example_sentence}

    Raises:
        RuntimeError: If the API call fails or returns invalid JSON.
    """
    user_content = f"Word: {word}"
    if context:
        user_content += f"\nContext: {context}"

    client = OpenAI(api_key=api_key, base_url=DEEPSEEK_API_BASE)

    try:
        resp = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": DEFINITION_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.3,
            max_tokens=500,
        )
    except Exception as e:
        error_msg = str(e)
        if "401" in error_msg or "unauthorized" in error_msg.lower():
            raise RuntimeError("Invalid DeepSeek API Key")
        raise RuntimeError(f"DeepSeek API error: {error_msg}")

    raw = resp.choices[0].message.content.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        import re
        match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass
        return {
            "phonetic": "",
            "definition_en": f"(definition unavailable for '{word}')",
            "definition_zh": f"(无法获取 '{word}' 的释义)",
            "example_sentence": context or "",
        }
