"""Tests for the hosted-mode config keys in keyring_store."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from systems.config.keyring_store import (
    ALL_KEYS,
    set_key,
    get_key,
    get_status,
)


def _clear(*keys):
    for k in keys:
        set_key(k, "")  # empty value deletes the key


def test_hosted_keys_registered():
    assert "ai_mode" in ALL_KEYS
    assert "gateway_url" in ALL_KEYS
    assert "activation_code" in ALL_KEYS


def test_set_and_get_hosted_keys():
    set_key("ai_mode", "hosted")
    set_key("gateway_url", "https://gateway.example.com")
    set_key("activation_code", "AIES-ABCD-EFGH")
    try:
        assert get_key("ai_mode") == "hosted"
        assert get_key("gateway_url") == "https://gateway.example.com"
        assert get_key("activation_code") == "AIES-ABCD-EFGH"
    finally:
        _clear("ai_mode", "gateway_url", "activation_code")


def test_get_status_includes_hosted_fields():
    set_key("ai_mode", "hosted")
    try:
        status = get_status()
        assert status["ai_mode"] is True
        assert status["gateway_url"] is False
        assert status["activation_code"] is False
    finally:
        _clear("ai_mode")


def test_empty_value_clears_key():
    set_key("gateway_url", "https://x")
    set_key("gateway_url", "")
    assert get_key("gateway_url") is None
