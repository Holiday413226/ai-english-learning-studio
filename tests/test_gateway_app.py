"""Integration test for the gateway /v1/ai endpoint (auth → audit → dispatch)."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'gateway'))

import pytest
from unittest.mock import patch


@pytest.fixture
def gw(monkeypatch, tmp_path):
    import auth
    import audit
    import gateway_server

    monkeypatch.setattr(auth, "DB_PATH", str(tmp_path / "codes.db"))
    monkeypatch.setattr(audit, "LOG_PATH", str(tmp_path / "usage.log"))

    gapp = gateway_server.create_app()
    gapp.config["TESTING"] = True
    yield gapp, tmp_path


def _post(client, code, body):
    return client.post(
        "/v1/ai",
        json=body,
        headers={"Authorization": f"Bearer {code}"},
    )


def test_valid_code_dispatches_and_audits(gw):
    import auth
    from unittest.mock import patch

    gapp, tmp_path = gw
    code = auth.create_codes(1)[0]

    with patch("ops.quick_define", return_value={"phonetic": "həˈləʊ"}) as m:
        with gapp.test_client() as c:
            resp = _post(c, code, {"op": "novel_define", "params": {"word": "hello"}})

    assert resp.status_code == 200
    assert resp.get_json()["result"]["phonetic"] == "həˈləʊ"
    m.assert_called_once_with("", "hello", "")

    line = (tmp_path / "usage.log").read_text(encoding="utf-8").strip()
    assert '"ok": true' in line
    assert '"op": "novel_define"' in line


def test_invalid_code_returns_401_and_audits(gw):
    import auth

    gapp, tmp_path = gw
    with gapp.test_client() as c:
        resp = _post(c, "AIES-NOPE-NOPE-NOPE-NOPE", {"op": "novel_define", "params": {}})

    assert resp.status_code == 401
    assert "auth" in (tmp_path / "usage.log").read_text(encoding="utf-8")
