"""Tests for Dashboard stats aggregation endpoint."""
import pytest
import sys
import os
import json
import time
import tempfile
import shutil
from pathlib import Path
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app import create_app


class TestDashboardStats:
    """Tests for GET /api/dashboard/stats."""

    @pytest.fixture
    def client(self):
        app = create_app()
        app.config['TESTING'] = True
        with app.test_client() as c:
            yield c

    def test_stats_empty_state_returns_valid_structure(self, client):
        """GET /api/dashboard/stats returns valid JSON structure with zero
        values when no data exists."""
        resp = client.get('/api/dashboard/stats')
        assert resp.status_code == 200
        data = resp.get_json()

        # Top-level keys
        assert 'today' in data
        assert 'streak' in data
        assert 'total_vocab' in data
        assert 'modules' in data

        # today sub-keys
        today = data['today']
        assert isinstance(today, dict)
        assert 'novel_chars' in today
        assert 'diary_count' in today
        assert 'debate_rounds' in today
        assert 'vocab_added' in today

        # All today values typed as int
        assert isinstance(today['novel_chars'], int)
        assert isinstance(today['diary_count'], int)
        assert isinstance(today['debate_rounds'], int)
        assert isinstance(today['vocab_added'], int)
        assert isinstance(data['streak'], int)
        assert isinstance(data['total_vocab'], int)

        # modules
        modules = data['modules']
        assert isinstance(modules, dict)
        for name in ['novel', 'diary', 'debater', 'minecraft']:
            assert name in modules
            assert isinstance(modules[name], bool)

        # With no data, all values should be zero/false
        assert today['novel_chars'] == 0
        assert today['diary_count'] == 0
        assert today['debate_rounds'] == 0
        assert today['vocab_added'] == 0
        assert data['streak'] == 0
        assert data['total_vocab'] == 0
        for name in ['novel', 'diary', 'debater', 'minecraft']:
            assert modules[name] is False


class TestDashboardStatsWithData:
    """Tests with pre-seeded data across subsystems."""

    @pytest.fixture
    def seeded_client(self, tmp_path):
        """Create a Flask app that uses tmp_path as the data directory."""
        data_dir = str(tmp_path / "data")

        # Seed novel session data — one session with two assistant messages today
        novel_dir = Path(data_dir) / "novel"
        novel_dir.mkdir(parents=True, exist_ok=True)
        now = time.time()
        novel_session = {
            "session_id": "novel-sess-1",
            "messages": [
                {"role": "user", "content": "Hello", "timestamp": now},
                {"role": "assistant", "content": "Hi there! How can I help?", "timestamp": now},
                {"role": "assistant", "content": "Another response with more text.", "timestamp": now},
            ],
            "created_at": now,
            "updated_at": now,
        }
        with open(novel_dir / "session_novel-sess-1.json", "w", encoding="utf-8") as f:
            json.dump(novel_session, f)

        # Seed debater session data — one session with two user messages today
        debater_dir = Path(data_dir) / "debater"
        debater_dir.mkdir(parents=True, exist_ok=True)
        debater_session = {
            "session_id": "deb-sess-1",
            "mode": "debate",
            "messages": [
                {"role": "user", "content": "I think AI is good", "timestamp": now},
                {"role": "assistant", "content": "But what about jobs?", "timestamp": now},
                {"role": "user", "content": "Good point", "timestamp": now},
            ],
            "created_at": now,
            "updated_at": now,
        }
        with open(debater_dir / "session_deb-sess-1.json", "w", encoding="utf-8") as f:
            json.dump(debater_session, f)

        # Seed diary entries — 3 entries over 3 consecutive days
        diary_dir = Path(data_dir) / "diary"
        diary_dir.mkdir(parents=True, exist_ok=True)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
        day_before = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%d")
        diary_entries = {
            "entries": [
                {
                    "date": day_before,
                    "original": "Day 1 entry",
                    "created_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(),
                },
                {
                    "date": yesterday,
                    "original": "Day 2 entry",
                    "created_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
                },
                {
                    "date": today_str,
                    "original": "Day 3 entry",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            ]
        }
        with open(diary_dir / "entries.json", "w", encoding="utf-8") as f:
            json.dump(diary_entries, f)

        # Seed vocab vault — 5 words, 2 created today
        vocab_dir = Path(data_dir) / "vocab"
        vocab_dir.mkdir(parents=True, exist_ok=True)
        today_iso = datetime.now(timezone.utc).isoformat()
        older_iso = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        vault_data = {
            "version": 1,
            "words": {
                "abandon": {
                    "word": "abandon",
                    "source_module": "novel",
                    "created_at": today_iso,
                },
                "brilliant": {
                    "word": "brilliant",
                    "source_module": "debater",
                    "created_at": today_iso,
                },
                "curious": {
                    "word": "curious",
                    "source_module": "diary",
                    "created_at": older_iso,
                },
                "diligent": {
                    "word": "diligent",
                    "source_module": "minecraft",
                    "created_at": older_iso,
                },
                "elegant": {
                    "word": "elegant",
                    "source_module": "novel",
                    "created_at": older_iso,
                },
            },
        }
        with open(vocab_dir / "vault.json", "w", encoding="utf-8") as f:
            json.dump(vault_data, f)

        # Patch the singleton storage instances to use our temp dir
        import systems.novel.session_storage as ns
        import systems.debater.session_storage as ds
        import systems.vocab.vault as vv

        orig_novel_dir = ns.novel_storage._system_dir
        orig_debater_dir = ds.debater_storage._system_dir
        orig_vocab_dir = vv.vocab_vault._system_dir

        ns.novel_storage._system_dir = Path(data_dir) / "novel"
        ds.debater_storage._system_dir = Path(data_dir) / "debater"
        vv.vocab_vault._system_dir = Path(data_dir) / "vocab"
        vv.vocab_vault._vault_file = vv.vocab_vault._system_dir / "vault.json"

        # Need to patch the diary data path too — it's read from the endpoint directly
        app = create_app()
        app.config['TESTING'] = True
        # Provide the data_dir override so the endpoint can find our seeded data
        app.config['DASHBOARD_DATA_DIR'] = data_dir

        with app.test_client() as c:
            yield c

        # Restore originals
        ns.novel_storage._system_dir = orig_novel_dir
        ds.debater_storage._system_dir = orig_debater_dir
        vv.vocab_vault._system_dir = orig_vocab_dir
        vv.vocab_vault._vault_file = orig_vocab_dir / "vault.json"

    def test_stats_with_seeded_data(self, seeded_client):
        """Stats reflect pre-seeded data correctly."""
        resp = seeded_client.get('/api/dashboard/stats')
        assert resp.status_code == 200
        data = resp.get_json()

        today = data['today']

        # Novel chars: 2 assistant messages = "Hi there! How can I help?" + "Another response with more text."
        # = 25 + 32 = 57 chars
        assert today['novel_chars'] == 57

        # Diary count: 1 entry today (date matches today_str)
        assert today['diary_count'] == 1

        # Debate rounds: 2 user messages today
        assert today['debate_rounds'] == 2

        # Vocab added: 2 words created today
        assert today['vocab_added'] == 2

        # Streak: 3 consecutive days
        assert data['streak'] == 3

        # Total vocab: 5 words
        assert data['total_vocab'] == 5

        # Modules: all have data
        assert data['modules']['novel'] is True
        assert data['modules']['diary'] is True
        assert data['modules']['debater'] is True
        assert data['modules']['minecraft'] is False  # no minecraft session

    def test_stats_without_data_dir(self, seeded_client):
        """If a data directory is missing, stats return 0 gracefully."""
        # The minecraft dir doesn't exist — modules.minecraft should be False
        resp = seeded_client.get('/api/dashboard/stats')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['modules']['minecraft'] is False
        # All other modules have data
        assert data['modules']['novel'] is True
        assert data['modules']['diary'] is True
        assert data['modules']['debater'] is True
