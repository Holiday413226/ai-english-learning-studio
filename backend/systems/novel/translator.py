"""DeepSeek AI translation engine with vocabulary highlighting.

Used by the Novel subsystem.  Each request carries its own api_key —
no key is ever stored on the backend.
"""

import re
import json
from openai import OpenAI
from core.config import DEEPSEEK_API_BASE, DEEPSEEK_MODEL, SYSTEM_PROMPT, MAX_CHUNK_SIZE


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
  "example_sentence": "string"
}"""


def translate(api_key, novel_text, vocab_list):
    """
    Translate Chinese novel to English using DeepSeek API.

    Args:
        api_key: DeepSeek API key (from frontend, never persisted).
        novel_text: Raw Chinese novel text.
        vocab_list: List of CET-4/6 vocabulary words.

    Returns:
        dict: {"translated_text": str, "highlights": [{word, start, end}]}
    """
    if not vocab_list:
        # No vocab — translate without marking
        client = OpenAI(api_key=api_key, base_url=DEEPSEEK_API_BASE)
        chunks = _chunk_text(novel_text)
        translated = []
        for chunk in chunks:
            resp = client.chat.completions.create(
                model=DEEPSEEK_MODEL,
                messages=[
                    {"role": "system", "content": "Translate Chinese novel text to natural English."},
                    {"role": "user", "content": chunk},
                ],
                temperature=0.3,
                max_tokens=4096,
            )
            translated.append(resp.choices[0].message.content)
        return {
            "translated_text": "\n\n".join(translated),
            "highlights": [],
        }

    # Build vocabulary-aware system prompt
    vocab_lines = "\n".join(f"- {w}" for w in vocab_list if w.strip())
    system_prompt = SYSTEM_PROMPT.format(vocab_list=vocab_lines)

    client = OpenAI(api_key=api_key, base_url=DEEPSEEK_API_BASE)
    chunks = _chunk_text(novel_text)

    all_raw = []
    for i, chunk in enumerate(chunks):
        resp = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": f"Translate this Chinese text to English:\n\n{chunk}",
                },
            ],
            temperature=0.3,
            max_tokens=4096,
        )
        all_raw.append(resp.choices[0].message.content)

    full_raw = "\n\n".join(all_raw)
    clean_text, highlights = _parse_highlights(full_raw)

    return {
        "translated_text": clean_text,
        "highlights": highlights,
    }


def quick_define(api_key: str, word: str, context: str = "") -> dict:
    """Generate a structured word definition using DeepSeek.

    Lightweight version for the Novel subsystem — returns only the
    fields needed for the hover popup: phonetic, definition_en, definition_zh.

    Args:
        api_key: DeepSeek API key.
        word: The word to define.
        context: Optional sentence/context where the word appeared.

    Returns:
        dict: {phonetic, definition_en, definition_zh}

    Raises:
        RuntimeError: If the API call fails or the key is invalid.
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

    # Try direct JSON parse first
    try:
        result = json.loads(raw)
        return _pick_define_fields(result, word)
    except json.JSONDecodeError:
        pass

    # Try to extract JSON from markdown code fences
    match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw, re.DOTALL)
    if match:
        try:
            result = json.loads(match.group(1))
            return _pick_define_fields(result, word)
        except json.JSONDecodeError:
            pass

    # Fallback: return minimal definition
    return {
        "phonetic": "",
        "definition_en": f"(definition unavailable for '{word}')",
        "definition_zh": f"(无法获取 '{word}' 的释义)",
    }


def _pick_define_fields(result: dict, word: str) -> dict:
    """Extract only phonetic, definition_en, definition_zh from a full result."""
    return {
        "phonetic": result.get("phonetic", ""),
        "definition_en": result.get("definition_en", f"(definition unavailable for '{word}')"),
        "definition_zh": result.get("definition_zh", f"(无法获取 '{word}' 的释义)"),
    }


def _chunk_text(text, max_size=None):
    """Split text into manageable chunks, respecting paragraph boundaries."""
    if max_size is None:
        max_size = MAX_CHUNK_SIZE

    paragraphs = text.split("\n")
    chunks = []
    current = []
    current_len = 0

    for para in paragraphs:
        if current_len + len(para) > max_size and current:
            chunks.append("\n".join(current))
            current = []
            current_len = 0
        current.append(para)
        current_len += len(para)

    if current:
        chunks.append("\n".join(current))

    return chunks or [text]


def _parse_highlights(text):
    """
    Parse [[[word]]] markers from translated text.

    Returns (clean_text, highlights) where highlights is a list of
    {word, start, end} dicts giving character positions in clean_text.
    """
    highlights = []
    pattern = re.compile(r"\[\[\[(.+?)\]\]\]")

    offset = 0
    for match in pattern.finditer(text):
        word = match.group(1)
        # Calculate position after accounting for previously-removed markers
        word_start = match.start() - offset
        word_end = word_start + len(word)
        highlights.append({"word": word, "start": word_start, "end": word_end})
        # Each [[[...]]] marker removes 6 extra characters
        offset += (match.end() - match.start()) - len(word)

    clean_text = pattern.sub(r"\1", text)
    return clean_text, highlights
