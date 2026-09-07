"""Tests for the gateway audit logger."""
import sys
import os
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'gateway'))

import audit


def test_log_writes_one_json_line(monkeypatch, tmp_path):
    monkeypatch.setattr(audit, "LOG_PATH", str(tmp_path / "usage.log"))
    audit.log("AIES-ABCD", "novel_define", ok=True)
    audit.log("AIES-ABCD", "novel_define", ok=False, detail="boom")

    lines = (tmp_path / "usage.log").read_text(encoding="utf-8").strip().split("\n")
    assert len(lines) == 2

    first = json.loads(lines[0])
    assert first["code"] == "AIES-ABCD"
    assert first["op"] == "novel_define"
    assert first["ok"] is True

    second = json.loads(lines[1])
    assert second["ok"] is False
    assert second["detail"] == "boom"


def test_log_never_raises_on_missing_dir(monkeypatch, tmp_path):
    monkeypatch.setattr(audit, "LOG_PATH", str(tmp_path / "nope" / "deep" / "usage.log"))
    # Should not raise even though no dirs exist (best-effort).
    audit.log("AIES-X", "op", ok=True)
