"""COZE Bot API client for debate/discussion chat.

COZE v3 is **asynchronous**: POST /v3/chat returns immediately with
status "in_progress".  We must poll until "completed", then fetch
the message list to get the bot's actual reply.

Flow:
  1. POST /v3/chat  →  { data: { id, conversation_id, status } }
  2. Poll GET /v3/chat/retrieve  until status == "completed"
  3. GET /v3/chat/message/list   →  extract assistant message
"""

import sys
import json
import time
import requests
from core.config import COZE_API_BASE

# ── Polling settings ────────────────────────────────────────────
POLL_INTERVAL = 1.5   # seconds between status checks
POLL_TIMEOUT = 60     # max seconds to wait for completion


def _safe_stderr(msg: str) -> None:
    """Write to stderr without ever raising (emoji/GBK/broken-pipe safe).

    Debug output is best-effort — it must never break an in-flight request.
    On Chinese Windows the console (and a ``console=False`` EXE's stderr)
    is GBK-encoded, so printing a COZE reply containing an emoji would
    otherwise raise ``UnicodeEncodeError`` and turn the response into an
    HTML 500 page.
    """
    try:
        print(msg, file=sys.stderr)
    except Exception:
        pass


def _debug(title, obj):
    """Print debug info to stderr so it shows in the Flask console."""
    _safe_stderr(f"\n{'='*60}")
    _safe_stderr(f"  {title}")
    _safe_stderr(f"{'='*60}")
    if isinstance(obj, str):
        _safe_stderr(obj[:4000])
    else:
        _safe_stderr(json.dumps(obj, indent=2, ensure_ascii=True)[:4000])
    _safe_stderr(f"{'='*60}\n")


def _extract_text_from_messages(messages) -> str:
    """Extract assistant text from a list of COZE message objects.

    COZE message list format:
    [
      {"id": "...", "role": "user", "content": "...", "content_type": "text"},
      {"id": "...", "role": "assistant", "type": "answer", "content": "Hi!"},
    ]
    """
    if not messages:
        return ""

    text_parts = []

    for msg in messages:
        if not isinstance(msg, dict):
            continue

        role = msg.get("role", "")

        # Skip user echoes
        if role == "user":
            continue

        content = msg.get("content", "")

        # type can be "answer" (v3) or content_type can be "text"
        ctype = msg.get("type") or msg.get("content_type", "")

        if ctype in ("answer", "text"):
            if isinstance(content, str) and len(content.strip()) > 0:
                text_parts.append(content)
        elif ctype == "multimodal":
            # Might contain text parts
            if isinstance(content, str) and len(content.strip()) > 5:
                text_parts.append(content)
        else:
            # Unknown type — grab content if it looks meaningful
            if isinstance(content, str) and len(content.strip()) > 5:
                text_parts.append(content)

    return "\n\n".join(text_parts) if text_parts else ""


def chat_with_bot(
    api_key: str,
    bot_id: str,
    user_message: str,
    conversation_id: str = None,
    additional_params: dict = None,
    api_url: str = None,
) -> dict:
    """Send a message to a COZE bot and return normalized response.

    Because COZE v3 is async, this function:
      1. POSTs to /v3/chat to initiate
      2. Polls /v3/chat/retrieve until status == "completed"
      3. Fetches /v3/chat/message/list to get the bot's reply
      4. Extracts text and audio_url from the message list

    Args:
        api_key: COZE platform API key (bearer token).
        bot_id: COZE Bot ID to call.
        user_message: The user's text message.
        conversation_id: Optional ongoing conversation ID for multi-turn.
        additional_params: Optional extra bot parameters.
        api_url: Optional COZE API base URL (defaults to config COZE_API_BASE).

    Returns:
        dict: {"text": str, "audio_url": str | None,
               "conversation_id": str | None}

    Raises:
        RuntimeError on HTTP or API-level errors.
    """
    base_url = (api_url or COZE_API_BASE).rstrip("/")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    # ── Step 1: Initiate chat ───────────────────────────────────
    chat_url = f"{base_url}/v3/chat"

    payload = {
        "bot_id": bot_id,
        "user_id": "debater-app-user",
        "stream": False,
        "auto_save_history": True,
        "additional_messages": [
            {
                "role": "user",
                "content": user_message,
                "content_type": "text",
            }
        ],
    }

    if conversation_id:
        payload["conversation_id"] = conversation_id

    if additional_params:
        payload["additional_parameters"] = additional_params

    _debug("COZE REQUEST (POST /v3/chat)", {
        "url": chat_url,
        "payload": payload,
    })

    try:
        resp = requests.post(chat_url, json=payload, headers=headers, timeout=30)
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"COZE API request failed: {e}")

    if resp.status_code in (401, 403):
        raise RuntimeError("Invalid COZE API Key or Bot ID.")
    if resp.status_code == 429:
        raise RuntimeError("COZE API rate limit exceeded. Try again later.")
    if resp.status_code != 200:
        raise RuntimeError(f"COZE API HTTP {resp.status_code}: {resp.text[:500]}")

    try:
        data = resp.json()
    except json.JSONDecodeError:
        raise RuntimeError(f"COZE returned non-JSON: {resp.text[:300]}")

    _debug("COZE INITIAL RESPONSE", data)

    # Check top-level error
    code = data.get("code", 0)
    if code != 0:
        msg = data.get("msg", data.get("message", "Unknown COZE error"))
        raise RuntimeError(f"COZE API error code {code}: {msg}")

    inner = data.get("data") or data
    if not isinstance(inner, dict):
        raise RuntimeError(f"Unexpected COZE response structure: {data}")

    chat_id = inner.get("id", "")
    returned_conversation_id = inner.get("conversation_id") or conversation_id
    status = inner.get("status", "")

    _debug("CHAT INITIATED", {
        "chat_id": chat_id,
        "conversation_id": returned_conversation_id,
        "status": status,
    })

    # ── Step 2: Poll until completed ────────────────────────────
    retrieve_url = f"{base_url}/v3/chat/retrieve"

    start_time = time.time()
    poll_count = 0

    while status not in ("completed", "failed", "requires_action"):
        if time.time() - start_time > POLL_TIMEOUT:
            raise RuntimeError(
                f"COZE chat timed out after {POLL_TIMEOUT}s (status: {status})"
            )

        time.sleep(POLL_INTERVAL)
        poll_count += 1

        params = {
            "chat_id": chat_id,
            "conversation_id": returned_conversation_id,
        }

        try:
            r = requests.get(
                retrieve_url,
                params=params,
                headers=headers,
                timeout=15,
            )
        except requests.exceptions.RequestException as e:
            _safe_stderr(f"  [poll #{poll_count}] request failed: {e}")
            continue

        if r.status_code != 200:
            _safe_stderr(
                f"  [poll #{poll_count}] HTTP {r.status_code}: {r.text[:200]}"
            )
            continue

        try:
            poll_data = r.json()
        except json.JSONDecodeError:
            continue

        poll_inner = poll_data.get("data") or poll_data
        if isinstance(poll_inner, dict):
            new_status = poll_inner.get("status", status)
            if new_status != status:
                _debug(f"STATUS CHANGE (poll #{poll_count})", {
                    "old_status": status,
                    "new_status": new_status,
                })
            status = new_status

        _safe_stderr(
            f"  [poll #{poll_count}] status={status}  ({time.time() - start_time:.1f}s elapsed)"
        )

    if status == "failed":
        last_error = inner.get("last_error", {})
        err_msg = last_error.get("msg", "Unknown failure") if isinstance(last_error, dict) else str(last_error)
        raise RuntimeError(f"COZE chat failed: {err_msg}")

    _debug("CHAT COMPLETED", {"chat_id": chat_id, "polls": poll_count})

    # ── Step 3: Fetch message list ──────────────────────────────
    messages_url = f"{base_url}/v3/chat/message/list"

    params = {
        "chat_id": chat_id,
        "conversation_id": returned_conversation_id,
    }

    _debug("FETCHING MESSAGES", {"url": messages_url, "params": params})

    try:
        msg_resp = requests.get(
            messages_url,
            params=params,
            headers=headers,
            timeout=15,
        )
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"COZE message list request failed: {e}")

    if msg_resp.status_code != 200:
        raise RuntimeError(
            f"COZE message list HTTP {msg_resp.status_code}: {msg_resp.text[:500]}"
        )

    try:
        msg_data = msg_resp.json()
    except json.JSONDecodeError:
        raise RuntimeError(f"COZE message list non-JSON: {msg_resp.text[:300]}")

    _debug("MESSAGE LIST RAW", msg_data)

    # The message list can be in msg_data["data"] (array)
    # or wrapped in another structure
    msg_inner = msg_data.get("data") or msg_data
    messages = []
    if isinstance(msg_inner, list):
        messages = msg_inner
    elif isinstance(msg_inner, dict):
        messages = (
            msg_inner.get("messages")
            or msg_inner.get("items")
            or msg_inner.get("data")
            or []
        )
        if isinstance(messages, dict):
            # sometimes data is nested one more level
            messages = messages.get("messages") or messages.get("items") or []

    if not isinstance(messages, list):
        messages = []

    _debug("MESSAGES ARRAY", {"count": len(messages), "preview": messages[:5]})

    # ── Step 4: Extract text ────────────────────────────────────
    text = _extract_text_from_messages(messages)

    # If no text from message list, try deep search as last resort
    if not text:
        def _safe_deep_find(obj, depth=0):
            """Recursively search for reply text, excluding metadata keys."""
            if depth > 5:
                return None
            SKIP_KEYS = {"id", "bot_id", "chat_id", "conversation_id",
                         "user_id", "created_at", "updated_at", "timestamp",
                         "status", "code", "msg", "message", "token", "usage"}
            if isinstance(obj, dict):
                for key in ("answer", "content", "text", "reply", "response", "output"):
                    val = obj.get(key)
                    if isinstance(val, str) and len(val.strip()) > 5:
                        # Make sure it's not just an ID
                        if not val.strip().isdigit():
                            return val
                for k, v in obj.items():
                    if k in SKIP_KEYS:
                        continue
                    r = _safe_deep_find(v, depth + 1)
                    if r:
                        return r
            elif isinstance(obj, list):
                for item in obj:
                    r = _safe_deep_find(item, depth + 1)
                    if r:
                        return r
            return None

        text = _safe_deep_find(msg_data) or ""

    # ── Extract audio URL ─────────────────────────────────────
    audio_url = None
    for msg in messages:
        if isinstance(msg, dict):
            au = msg.get("audio_url") or msg.get("tts_url") or msg.get("voice_url")
            if au:
                audio_url = au
                break

    if not audio_url:
        audio_url = inner.get("audio_url") or inner.get("tts_url")

    # ── Fallback ─────────────────────────────────────────────
    if not text:
        text = "[COZE returned empty response]"
        _debug("WARNING", "All extraction methods failed — returning placeholder")

    _debug("FINAL RESULT", {
        "text": text[:500],
        "audio_url": audio_url,
        "conversation_id": returned_conversation_id,
    })

    return {
        "text": text,
        "audio_url": audio_url,
        "conversation_id": returned_conversation_id,
    }
