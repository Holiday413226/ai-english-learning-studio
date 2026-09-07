"""Tests for the hosted gateway client (mode branching + key resolution)."""
import sys
import os
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from core.gateway_client import run_ai, get_ai_mode, is_hosted


def test_get_ai_mode_defaults_to_byok():
    with patch("core.gateway_client.get_key", return_value=None):
        assert get_ai_mode() == "byok"


def test_get_ai_mode_reads_configured_value():
    with patch("core.gateway_client.get_key", return_value="hosted"):
        assert get_ai_mode() == "hosted"


def test_run_ai_byok_calls_direct():
    direct = lambda: {"text": "from-direct"}
    with patch("core.gateway_client.is_hosted", return_value=False):
        assert run_ai("novel_define", {"word": "x"}, direct) == {"text": "from-direct"}


def test_run_ai_hosted_calls_gateway():
    direct = lambda: {"text": "should-not-run"}
    with patch("core.gateway_client.is_hosted", return_value=True), \
         patch("core.gateway_client.call_ai", return_value={"text": "from-gateway"}) as mock:
        result = run_ai("novel_define", {"word": "x"}, direct)
        assert result == {"text": "from-gateway"}
        mock.assert_called_once_with("novel_define", {"word": "x"})


def test_is_hosted_false_without_url_or_code():
    with patch("core.gateway_client.get_ai_mode", return_value="hosted"), \
         patch("core.gateway_client.get_gateway_url", return_value=""), \
         patch("core.gateway_client.get_activation_code", return_value="code"):
        assert is_hosted() is False


def test_is_hosted_true_when_fully_configured():
    with patch("core.gateway_client.get_ai_mode", return_value="hosted"), \
         patch("core.gateway_client.get_gateway_url", return_value="https://g.example.com"), \
         patch("core.gateway_client.get_activation_code", return_value="AIES-ABCD"):
        assert is_hosted() is True
