"""Tests for Vocab Vault — word storage, SM-2 review, quiz generation."""
import pytest
import sys
import os
import json
import tempfile
import shutil
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app import create_app
from systems.vocab.vault import VocabVault


class TestVocabVault:
    """Unit tests for the VocabVault class (no HTTP needed)."""

    def setup_method(self):
        self.tmpdir = tempfile.mkdtemp()
        self.vault = VocabVault(data_dir=self.tmpdir)

    def teardown_method(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_add_word_creates_entry(self):
        word = self.vault.add_word("abandon", "novel", "The crew abandoned...")
        assert word["word"] == "abandon"
        assert word["source_module"] == "novel"
        assert word["review_count"] == 0
        assert word["next_review"] is not None

    def test_add_duplicate_word_is_idempotent(self):
        w1 = self.vault.add_word("abandon", "novel", "ctx1")
        w2 = self.vault.add_word("abandon", "debater", "ctx2")
        assert w1["word"] == w2["word"]
        # Should not create duplicate — source_module stays as first
        assert w2["source_module"] == "novel"

    def test_sm2_quality_0_resets_interval(self):
        self.vault.add_word("test", "diary", "ctx")
        result = self.vault.review_word("test", 0)  # complete blackout
        assert result["next_review"] is not None
        # After a 0, easiness_factor should decrease
        word = self.vault.get_word("test")
        assert word["easiness_factor"] <= 2.5

    def test_sm2_quality_5_increases_interval(self):
        self.vault.add_word("test", "diary", "ctx")
        result = self.vault.review_word("test", 5)  # perfect recall
        word = self.vault.get_word("test")
        assert word["review_count"] == 1
        assert word["easiness_factor"] >= 2.5

    def test_quiz_generates_n_questions(self):
        for w in ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot",
                   "golf", "hotel", "india", "juliet", "kilo", "lima"]:
            self.vault.add_word(w, "diary", f"context for {w}")
        questions = self.vault.generate_quiz(count=10)
        assert len(questions) == 10
        for q in questions:
            assert "word" in q
            assert "options" in q
            assert len(q["options"]) == 4
            assert "correct" in q
            assert 0 <= q["correct"] <= 3

    def test_quiz_returns_at_most_vault_size(self):
        # Vault needs >=4 words to generate a question (1 correct + 3 distractors)
        for w in ["hello", "world", "foo", "bar", "baz"]:
            self.vault.add_word(w, "diary", f"context for {w}")
        questions = self.vault.generate_quiz(count=10)
        assert len(questions) <= 5

    def test_export_csv_has_header(self):
        self.vault.add_word("hello", "novel", "Hello world!")
        csv_data = self.vault.export_csv()
        assert csv_data.startswith("word,definition_en,definition_zh")
        assert "hello" in csv_data


class TestVocabAPI:
    """Integration tests for vocab HTTP endpoints."""

    @pytest.fixture(autouse=True)
    def _vocab_isolate(self):
        """Give each test a fresh temp dir for vocab data."""
        import systems.vocab.router as r
        tmp = tempfile.mkdtemp()
        orig = r.vocab_vault._system_dir
        r.vocab_vault._system_dir = Path(tmp)
        yield
        shutil.rmtree(tmp, ignore_errors=True)
        r.vocab_vault._system_dir = orig

    @pytest.fixture
    def client(self):
        app = create_app()
        app.config['TESTING'] = True
        with app.test_client() as c:
            yield c

    def test_add_word_without_api_key_still_adds_word(self, client):
        """api_key is optional; word is still added without AI definitions."""
        resp = client.post('/api/vocab/add', json={
            'word': 'hello',
            'context': 'Hello world',
            'source_module': 'diary',
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['word'] == 'hello'
        assert data['source_module'] == 'diary'

    def test_list_empty_vault(self, client):
        resp = client.get('/api/vocab/list')
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'words' in data
        assert 'total' in data
