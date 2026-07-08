"""Secure API key storage using Windows Credential Manager via keyring.

Service name: "AIEnglishStudio"
Keys stored:
  - deepseek_api_key
  - coze_api_key
  - debate_bot_id
  - discuss_bot_id
  - minecraft_bot_id

On first access, keyring may prompt for system unlock (Windows).
"""

import keyring
import sys

SERVICE_NAME = "AIEnglishStudio"

# All known key names — used for status checks and bulk delete
ALL_KEYS = [
    "deepseek_api_key",
    "coze_api_key",
    "debate_bot_id",
    "discuss_bot_id",
    "minecraft_bot_id",
]


def set_key(key_name: str, value: str) -> None:
    """Store a key in Windows Credential Manager.

    Args:
        key_name: One of the ALL_KEYS constants.
        value: The secret value to store. Empty string clears the key.

    Raises:
        ValueError: If key_name is not in ALL_KEYS.
    """
    if key_name not in ALL_KEYS:
        raise ValueError(f"Unknown key: {key_name}")
    if not value.strip():
        _delete_key(key_name)
        return
    try:
        keyring.set_password(SERVICE_NAME, key_name, value.strip())
    except keyring.errors.KeyringError as e:
        raise RuntimeError(f"Failed to store key '{key_name}': {e}")


def get_key(key_name: str) -> str | None:
    """Retrieve a key from Windows Credential Manager.

    Returns None if the key is not found or keyring is unavailable.
    """
    try:
        return keyring.get_password(SERVICE_NAME, key_name)
    except keyring.errors.KeyringError:
        return None


def get_status() -> dict[str, bool]:
    """Return which keys are configured (True if key exists and is non-empty).

    Returns:
        dict with boolean values — the key names as the frontend expects them
        (deepseek, coze, debate_bot, discuss_bot, minecraft_bot).
    """
    result = {}
    name_map = {
        "deepseek_api_key": "deepseek",
        "coze_api_key": "coze",
        "debate_bot_id": "debate_bot",
        "discuss_bot_id": "discuss_bot",
        "minecraft_bot_id": "minecraft_bot",
    }
    for key_name in ALL_KEYS:
        val = get_key(key_name)
        frontend_name = name_map.get(key_name, key_name)
        result[frontend_name] = bool(val and val.strip())
    return result


def delete_all_keys() -> None:
    """Delete all stored keys from the credential manager."""
    for key_name in ALL_KEYS:
        try:
            keyring.delete_password(SERVICE_NAME, key_name)
        except keyring.errors.KeyringError:
            pass  # Key didn't exist — that's fine


def _delete_key(key_name: str) -> None:
    """Internal: delete a single key if it exists."""
    try:
        keyring.delete_password(SERVICE_NAME, key_name)
    except keyring.errors.KeyringError:
        pass
