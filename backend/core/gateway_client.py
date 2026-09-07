"""Gateway client — forwards AI ops to the hosted gateway in "hosted" mode.

In the default "byok" mode the routers keep calling DeepSeek/COZE directly
(unchanged behaviour).  When the app is switched to "hosted" mode, the same
routers instead resolve credentials through ``run_ai``, which POSTs the op to
the developer's gateway server and returns its result.
"""

import requests

from systems.config.keyring_store import get_key

HOSTED_MODE = "hosted"


def get_ai_mode() -> str:
    """Return the configured AI mode: "hosted" or "byok" (default)."""
    v = (get_key("ai_mode") or "").strip()
    return v if v in ("hosted", "byok") else "byok"


def get_gateway_url() -> str:
    return (get_key("gateway_url") or "").strip().rstrip("/")


def get_activation_code() -> str:
    return (get_key("activation_code") or "").strip()


def is_hosted() -> bool:
    """True when hosted mode is fully configured (url + code present)."""
    return (
        get_ai_mode() == HOSTED_MODE
        and bool(get_gateway_url())
        and bool(get_activation_code())
    )


def call_ai(op: str, params: dict) -> dict:
    """POST an AI op to the gateway and return its result dict.

    Raises RuntimeError with a user-readable message on any failure.
    """
    url = f"{get_gateway_url()}/v1/ai"
    headers = {
        "Authorization": f"Bearer {get_activation_code()}",
        "Content-Type": "application/json",
    }

    try:
        resp = requests.post(url, json={"op": op, "params": params}, headers=headers, timeout=180)
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"无法连接网关：{e}")

    try:
        data = resp.json()
    except ValueError:
        raise RuntimeError(f"网关返回异常（HTTP {resp.status_code}）")

    if resp.status_code == 401 or resp.status_code == 403:
        raise RuntimeError(data.get("error") or "激活码无效或已过期")
    if resp.status_code == 429:
        raise RuntimeError(data.get("error") or "已达使用上限")
    if resp.status_code != 200:
        raise RuntimeError(data.get("error") or f"网关错误（HTTP {resp.status_code}）")
    if not data.get("ok"):
        raise RuntimeError(data.get("error") or "网关调用失败")

    return data.get("result") or {}


def run_ai(op: str, params: dict, direct):
    """Execute an AI op via the gateway (hosted) or directly (byok).

    ``direct`` is a zero-arg callable that performs the existing in-process
    DeepSeek/COZE call — kept intact so byok mode behaves exactly as before.
    """
    if is_hosted():
        return call_ai(op, params)
    return direct()
