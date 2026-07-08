"""DeepSeek-powered diary grading engine.

Submits the user's English diary entry to DeepSeek and returns structured
feedback: sentence-level corrections, dimension scores, and highlighted
expressions worth collecting.
"""

import json
from openai import OpenAI
from core.config import DEEPSEEK_API_BASE, DEEPSEEK_MODEL

DIARY_SYSTEM_PROMPT = """You are a professional English writing tutor. Grade the following diary entry and provide detailed feedback.

You MUST return ONLY valid JSON (no other text) with this exact structure:
{
  "corrections": [
    {
      "sentence": "the original sentence",
      "issues": [
        {"original": "wrong part", "suggestion": "corrected version", "reason": "grammar rule or explanation"}
      ]
    }
  ],
  "score": {
    "grammar": <1-10>,
    "vocabulary": <1-10>,
    "fluency": <1-10>
  },
  "highlighted_expressions": [
    "well-written phrase 1",
    "well-written phrase 2"
  ]
}

Scoring criteria:
- grammar: accuracy of tenses, articles, prepositions, sentence structure (1=beginner, 10=native-like)
- vocabulary: range and appropriateness of word choice (1=basic, 10=rich and precise)
- fluency: overall naturalness and flow of the writing (1=broken, 10=smooth and native-like)

For "highlighted_expressions", pick 2-5 phrases or sentences that demonstrate good English usage and are worth the learner reviewing or adding to a vocabulary collection.

If the diary text is very short (less than 2 sentences), return all empty lists/zeros with a brief note in the first correction."""


def grade_entry(api_key: str, text: str, date: str = None) -> dict:
    """Grade a diary entry using DeepSeek and return structured feedback.

    Args:
        api_key: DeepSeek API key.
        text: The diary entry text to grade.
        date: Optional ISO date string for the entry.

    Returns:
        dict: {corrections: [...], score: {grammar, vocabulary, fluency},
               highlighted_expressions: [...]}

    Raises:
        RuntimeError: If the DeepSeek API call fails with an auth/network error.
    """
    client = OpenAI(api_key=api_key, base_url=DEEPSEEK_API_BASE)

    try:
        resp = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": DIARY_SYSTEM_PROMPT},
                {"role": "user", "content": f"Please grade this diary entry:\n\n{text}"},
            ],
            temperature=0.3,
            max_tokens=2000,
        )
    except Exception as e:
        error_msg = str(e)
        if "401" in error_msg or "unauthorized" in error_msg.lower():
            raise RuntimeError("Invalid DeepSeek API Key")
        raise RuntimeError(f"DeepSeek API error: {error_msg}")

    raw = resp.choices[0].message.content.strip()
    return _parse_response(raw)


def _parse_response(raw: str) -> dict:
    """Parse the DeepSeek response into a structured dict.

    Handles raw JSON, markdown-fenced JSON, and gracefully degrades
    on invalid input by returning a fallback structure.
    """
    # Try direct JSON parse first
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Try to extract JSON from markdown code fences
    import re
    match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Fallback: return a minimal valid structure
    return {
        "corrections": [{
            "sentence": "(raw response)",
            "issues": [{
                "original": "",
                "suggestion": "",
                "reason": "AI response could not be parsed into structured feedback"
            }]
        }],
        "score": {"grammar": 0, "vocabulary": 0, "fluency": 0},
        "highlighted_expressions": [],
    }


# Attach _parse_response to the grade_entry function so tests can access it
# without depending on internal module details.
grade_entry._parse_response = _parse_response
