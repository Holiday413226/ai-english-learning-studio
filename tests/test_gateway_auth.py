"""Tests for the gateway activation-code store and validation."""
import sys
import os
import pytest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'gateway'))

import auth
from auth import AuthError, create_codes, validate, revoke, list_codes, stats


def _use_temp_db(monkeypatch, tmp_path):
    monkeypatch.setattr(auth, "DB_PATH", str(tmp_path / "codes.db"))


def test_create_codes_returns_unique_codes(monkeypatch, tmp_path):
    _use_temp_db(monkeypatch, tmp_path)
    codes = create_codes(5)
    assert len(codes) == 5
    assert len(set(codes)) == 5
    assert all(c.startswith("AIES-") for c in codes)


def test_validate_ok_and_increments(monkeypatch, tmp_path):
    _use_temp_db(monkeypatch, tmp_path)
    code = create_codes(1)[0]
    validate(code)  # no raise
    validate(code)  # no raise
    rows = list_codes()
    assert rows[0]["used_total"] == 2


def test_validate_unknown_code_rejected(monkeypatch, tmp_path):
    _use_temp_db(monkeypatch, tmp_path)
    with pytest.raises(AuthError) as e:
        validate("AIES-NOPE-NOPE-NOPE-NOPE")
    assert e.value.status_code == 401


def test_validate_expired_code_rejected(monkeypatch, tmp_path):
    _use_temp_db(monkeypatch, tmp_path)
    past = (datetime.now() - timedelta(days=1)).isoformat()
    code = create_codes(1, expires_at=past)[0]
    with pytest.raises(AuthError) as e:
        validate(code)
    assert e.value.status_code == 401


def test_validate_daily_limit_enforced(monkeypatch, tmp_path):
    _use_temp_db(monkeypatch, tmp_path)
    code = create_codes(1, daily_limit=1)[0]
    validate(code)  # ok
    with pytest.raises(AuthError) as e:
        validate(code)  # exceeds daily cap
    assert e.value.status_code == 429


def test_revoke_deactivates_code(monkeypatch, tmp_path):
    _use_temp_db(monkeypatch, tmp_path)
    code = create_codes(1)[0]
    assert revoke(code) is True
    with pytest.raises(AuthError):
        validate(code)
    assert revoke("AIES-NOPE-NOPE-NOPE-NOPE") is False


def test_stats_aggregates(monkeypatch, tmp_path):
    _use_temp_db(monkeypatch, tmp_path)
    create_codes(3)
    s = stats()
    assert s["total"] == 3
    assert s["active"] == 3
    assert s["total_calls"] == 0
