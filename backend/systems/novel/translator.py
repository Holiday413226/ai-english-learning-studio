"""DeepSeek AI translation engine with vocabulary highlighting.

Used by the Novel subsystem.  Each request carries its own api_key —
no key is ever stored on the backend.
"""

import re
from openai import OpenAI
from core.config import DEEPSEEK_API_BASE, DEEPSEEK_MODEL, SYSTEM_PROMPT, MAX_CHUNK_SIZE


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
