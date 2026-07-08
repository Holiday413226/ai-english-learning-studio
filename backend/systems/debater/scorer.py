"""DeepSeek-powered debate scoring engine.

Analyzes a full conversation history and returns scores across four
dimensions (grammar, vocabulary, logic, fluency) with specific
improvement suggestions.
"""

import json
import re
from openai import OpenAI
from core.config import DEEPSEEK_API_BASE, DEEPSEEK_MODEL


SCORING_PROMPT = """You are an English debate coach evaluating a student's performance.

Analyze the following conversation between the student and an AI debate opponent.
Evaluate the student's English across four dimensions, each scored 1-10:

1. **grammar** — Accuracy of tenses, sentence structure, articles, prepositions.
2. **vocabulary** — Range, precision, and appropriateness of word choices.
3. **logic** — Clarity of arguments, logical structure, use of evidence/reasoning.
4. **fluency** — Naturalness of expression, coherence, and conversational flow.

Also provide 2-4 specific, actionable suggestions for improvement.

Return ONLY valid JSON, no other text:
{
  "grammar": <int 1-10>,
  "vocabulary": <int 1-10>,
  "logic": <int 1-10>,
  "fluency": <int 1-10>,
  "suggestions": ["<specific suggestion 1>", "<specific suggestion 2>", ...]
}"""


def _extract_json(raw: str) -> dict:
    """Extract a JSON object from a string, handling markdown code fences.

    Args:
        raw: The raw response text from DeepSeek.

    Returns:
        Parsed JSON dict.

    Raises:
        ValueError: If no valid JSON can be extracted.
    """
    # Try direct parse first
    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError:
        pass

    # Try ```json ... ``` fence
    match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Try finding any JSON object in the text
    match = re.search(r'\{[^{}]*"grammar"[^{}]*\}', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not parse scoring JSON from response: {raw[:200]}")


def score_conversation(api_key: str, messages: list[dict]) -> dict:
    """Score a full conversation using DeepSeek.

    Args:
        api_key: DeepSeek API key.
        messages: List of {role, content} dicts from the conversation.

    Returns:
        dict: {grammar, vocabulary, logic, fluency, suggestions}

    Raises:
        RuntimeError: If the API call fails or the response cannot be parsed.
    """
    # Build a transcript of the conversation for analysis
    transcript = ""
    for i, m in enumerate(messages, 1):
        role_label = "Student" if m["role"] == "user" else "Opponent"
        transcript += f"[{i}] {role_label}: {m['content']}\n"

    client = OpenAI(api_key=api_key, base_url=DEEPSEEK_API_BASE)

    try:
        resp = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": SCORING_PROMPT},
                {"role": "user", "content": f"Score this debate conversation:\n\n{transcript}"},
            ],
            temperature=0.3,
            max_tokens=800,
        )
    except Exception as e:
        raise RuntimeError(f"Scoring failed: {e}")

    raw = resp.choices[0].message.content.strip()

    try:
        result = _extract_json(raw)
    except ValueError as e:
        raise RuntimeError(str(e))

    # Validate required keys and clamp scores
    required = ["grammar", "vocabulary", "logic", "fluency", "suggestions"]
    for key in required:
        if key not in result:
            raise RuntimeError(f"Scoring response missing field: {key}")

    # Clamp scores to 1-10
    for dim in ("grammar", "vocabulary", "logic", "fluency"):
        result[dim] = max(1, min(10, int(result[dim])))

    # Ensure suggestions is a list of strings
    if not isinstance(result.get("suggestions"), list):
        result["suggestions"] = [str(result["suggestions"])]

    return result
