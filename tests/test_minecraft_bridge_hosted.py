"""Tests for the Minebot bridge env injection (hosted vs byok)."""
import sys
import os
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from systems.minecraft.bridge import _child_env


def test_hosted_mode_injects_activation_code_and_gateway_url():
    with patch("core.gateway_client.is_hosted", return_value=True), \
         patch("core.gateway_client.get_gateway_url", return_value="https://gateway.example.com"), \
         patch("core.gateway_client.get_activation_code", return_value="AIES-CODE"):
        env = _child_env()

    assert env["DEEPSEEK_API_KEY"] == "AIES-CODE"
    assert env["DEEPSEEK_API_URL"] == "https://gateway.example.com/v1"


def test_byok_mode_injects_real_deepseek_key():
    with patch("core.gateway_client.is_hosted", return_value=False), \
         patch("systems.config.keyring_store.get_key", return_value="sk-real"):
        env = _child_env()

    assert env["DEEPSEEK_API_KEY"] == "sk-real"
    assert "DEEPSEEK_API_URL" not in env
