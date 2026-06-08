"""Application configuration constants."""

import os

# DeepSeek API
DEEPSEEK_API_BASE = os.getenv("DEEPSEEK_API_BASE", "https://api.deepseek.com/v1")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

# Chunking
MAX_CHUNK_SIZE = 2000  # characters per translation chunk

# COZE API
COZE_API_BASE = os.getenv("COZE_API_BASE", "https://api.coze.cn")

# Flask
FLASK_HOST = os.getenv("FLASK_HOST", "127.0.0.1")
FLASK_PORT = int(os.getenv("FLASK_PORT", 5000))
MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10MB

# Translation system prompt
SYSTEM_PROMPT = """You are a literary translator. Translate the following Chinese novel text into natural, fluent English.

Vocabulary requirement: You MUST use the following CET-4/6 vocabulary words in your translation where contextually appropriate. For each vocabulary word you use, wrap it in [[[word]]] markers.

Vocabulary list:
{vocab_list}

Important rules:
1. Only mark words that EXACTLY match the vocabulary list above (case-insensitive).
2. Use vocabulary words naturally — don't force them where they don't fit.
3. Maintain the literary quality and tone of the original text.
4. Mark EVERY occurrence of a vocabulary word, not just the first one.
5. The markers [[[ and ]]] should surround ONLY the word itself, with no extra spaces.
6. Return ONLY the translated text, no explanations or notes."""
