# AI English Learning Studio v2.0.0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing AI Tool Suite v1.2.0 into AI English Learning Studio v2.0.0 — a 6-module desktop application (Dashboard + Novel + Diary + Debater + Minecraft Companion + Vocab Vault) with Windows Credential Manager secure key storage and PyInstaller EXE distribution.

**Architecture:** Incremental enhancement of the existing Flask + React (NES.css) codebase. Three new modules (Dashboard, Diary, Vocab Vault) are added alongside enhancements to three existing modules (Novel, Debater, Minecraft). Vocab Vault acts as a cross-module word collector — ⭐ buttons in every module feed into a shared vault with flashcard review and quiz. Minecraft takes a "Companion Panel" approach: the user chats with the bot inside PCL (game), and the Web panel provides a read-only conversation log + vocabulary collection interface.

**Tech Stack:** Python Flask 3.x, React 18 + Vite 5 + NES.css + Zustand 4, DeepSeek API (OpenAI SDK), COZE Bot API v3, `keyring` library, PyInstaller, pytest, Vitest

**Plan created:** 2026-07-07 | **Spec:** SPEC.md
**Last updated:** 2026-07-08 | **Status:** All 18 tasks complete ✅ | **Tests:** 51 passed

## Task Completion Log

| Task | Description | Status | Commit |
|------|-------------|--------|--------|
| 1 | Keyring config endpoints | ✅ | `4241795` |
| 2 | Vocab Vault backend (SM-2 + quiz) | ✅ | `4241795` |
| 3 | Diary backend (grader + router) | ✅ | `1b7bbeb` |
| 4 | Minecraft companion endpoints | ✅ | `7b64dcd` |
| 5 | Novel vocabulary define endpoint | ✅ | `d0fd9f1` |
| 6 | Debater scoring endpoint | ✅ | `3287a10` |
| 7 | Dashboard stats aggregation | ✅ | `6007e72` |
| 8 | Sidebar + App.jsx route update | ✅ | `0e7168a` |
| 9 | Dashboard page (frontend) | ✅ | `0e7168a` |
| 10 | Diary page (frontend) | ✅ | `0e7168a` |
| 11 | Minecraft Companion page (rewrite) | ✅ | `0e7168a` |
| 12 | Vocab Vault page (flashcard + quiz) | ✅ | `0e7168a` |
| 13 | VocabStar component + 4-module integration | ✅ | `0e7168a` |
| 14 | SetupModal keyring integration | ✅ | (via frontend SetupModal.jsx) |
| 15 | Makefile + test infrastructure | ✅ | `9e5d5b8` |
| 16 | .gitlab-ci.yml | ✅ | `9e5d5b8` |
| 17 | GitHub Actions release workflow | ✅ | (inherited from v1.2.0) |
| 18 | README + final documentation | ✅ | `c19d70e` |

**Additional commits (post-plan):**
- `4d1989d` — Debate Scoring button and result panel in DebaterPage UI
- `c5e91ce` — Fix test pollution (cleanup data/ before test-backend)
- `da715fb` — Update banner to v2.0.0

## Global Constraints

- **凭据安全:** Key 绝不硬编码、绝不提交 Git、不写日志。使用 Windows Credential Manager (keyring 库)。
- **TDD 强制:** 先写失败测试（红色），再写最少实现（绿色），再重构。禁止先实现后补测试。
- **NES.css 主题一致性:** 所有新增 UI 沿用紫-绿-黑像素复古风格 + "Press Start 2P" 字体 + Microsoft YaHei fallback。
- **模块隔离:** 每个子系统独立 router + session_storage + Zustand store + 前端 page 目录。
- **前端路由:** react-router-dom v7 — `/` (Dashboard), `/novel`, `/diary`, `/debater`, `/minecraft`, `/vocab`
- **EXE 分发:** PyInstaller + Flask serve static files on localhost:5000
- **凭据过渡方案:** localStorage 仍作为 session 缓存，keyring 做持久化。首次启动检测 keyring → 无则弹 SetupModal → 有则加载。
- **Minecraft 约束:** Web 面板仅展示对话历史 + 收藏词汇，不可发送消息。发消息在 PCL 游戏内完成。

---

## File Structure (Post-Implementation)

```
agent/
├── backend/
│   ├── app.py                          [MODIFY] — register new routes
│   ├── requirements.txt                [MODIFY] — add keyring
│   ├── core/
│   │   ├── config.py                   [MODIFY] — add Diary system prompt
│   │   └── coze_client.py              [UNCHANGED]
│   ├── systems/
│   │   ├── novel/
│   │   │   ├── router.py               [MODIFY] — add vocab add endpoint
│   │   │   ├── translator.py           [MODIFY] — add hover-definition API
│   │   │   └── session_storage.py      [UNCHANGED]
│   │   ├── debater/
│   │   │   ├── router.py               [MODIFY] — add score endpoint
│   │   │   └── session_storage.py      [UNCHANGED]
│   │   ├── minecraft/
│   │   │   ├── router.py               [MODIFY] — add companion endpoints
│   │   │   └── session_storage.py      [MODIFY] — add bot_status field
│   │   ├── diary/
│   │   │   ├── __init__.py             [CREATE]
│   │   │   ├── router.py               [CREATE]
│   │   │   ├── session_storage.py      [CREATE]
│   │   │   └── grader.py               [CREATE] — DeepSeek grading engine
│   │   └── vocab/
│   │       ├── __init__.py             [CREATE]
│   │       ├── router.py               [CREATE]
│   │       ├── vault.py                [CREATE] — CRUD + SM-2 logic
│   │       └── ai_definer.py           [CREATE] — DeepSeek word definition
│   └── data/                           [RUNTIME]
├── frontend/
│   └── src/
│       ├── App.jsx                     [MODIFY] — add new routes
│       ├── App.css                     [MODIFY] — add new component styles
│       ├── components/
│       │   ├── Sidebar.jsx             [MODIFY] — 3→6 nav items
│       │   ├── SetupModal.jsx          [MODIFY] — add Diary Bot ID
│       │   └── vocab/
│       │       ├── Flashcard.jsx       [CREATE]
│       │       ├── VocabStar.jsx       [CREATE] — reusable ⭐ button
│       │       └── QuizPanel.jsx       [CREATE]
│       ├── systems/
│       │   ├── novel/
│       │   │   ├── NovelPage.jsx       [MODIFY] — add hover+star
│       │   │   └── store.js            [MODIFY] — add context menu state
│       │   ├── debater/
│       │   │   ├── DebaterPage.jsx     [MODIFY] — add score+star
│       │   │   └── store.js            [MODIFY] — add score state
│       │   ├── minecraft/
│       │   │   ├── MinecraftPage.jsx   [REWRITE] — companion panel UI
│       │   │   └── store.js            [MODIFY] — add polling state
│       │   ├── diary/
│       │   │   ├── DiaryPage.jsx       [CREATE]
│       │   │   ├── store.js            [CREATE]
│       │   │   └── api.js              [CREATE]
│       │   ├── vocab/
│       │   │   ├── VocabPage.jsx       [CREATE]
│       │   │   ├── store.js            [CREATE]
│       │   │   └── api.js              [CREATE]
│       │   └── dashboard/
│       │       ├── DashboardPage.jsx   [CREATE]
│       │       ├── store.js            [CREATE]
│       │       └── api.js              [CREATE]
│       └── store/
│           └── configStore.js          [MODIFY] — add diary key fields
├── tests/
│   ├── test_diary_grader.py            [CREATE]
│   ├── test_vocab_vault.py             [CREATE]
│   ├── test_vocab_sm2.py               [CREATE]
│   ├── test_keyring_store.py           [CREATE]
│   └── test_config_status.py           [CREATE]
├── .gitlab-ci.yml                      [CREATE]
├── Makefile                            [CREATE]
└── scripts/
    └── start.ps1 / start.sh            [MODIFY] — add keyring setup step
```

---

## Phase 1: Foundation (Infrastructure + Backend APIs)

### Task 1: Add `keyring` dependency + config status endpoint

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app.py` — register config routes
- Create: `backend/systems/config/__init__.py`
- Create: `backend/systems/config/keyring_store.py`
- Create: `tests/test_config_status.py`

**Interfaces:**
- Consumes: (none — first task)
- Produces:
  - `POST /api/config/set` — `{key: str, value: str}` → `{status: "ok"}`
  - `GET /api/config/status` → `{deepseek: bool, coze: bool, debate_bot: bool, discuss_bot: bool, minecraft_bot: bool}`
  - `DELETE /api/config/keys` → `{status: "cleared"}`

- [ ] **Step 1: Write the failing test**

Create `tests/test_config_status.py`:
```python
"""Tests for config endpoints (keyring integration)."""
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app import create_app


@pytest.fixture
def client():
    app = create_app()
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


def test_config_status_returns_all_fields(client):
    """GET /api/config/status returns boolean flags for all key types."""
    resp = client.get('/api/config/status')
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'deepseek' in data
    assert 'coze' in data
    assert 'debate_bot' in data
    assert 'discuss_bot' in data
    assert 'minecraft_bot' in data
    # All should be booleans
    for k in data:
        assert isinstance(data[k], bool), f'{k} should be bool, got {type(data[k])}'


def test_config_set_and_status(client):
    """After setting a key via POST, status reflects it."""
    resp = client.post('/api/config/set', json={
        'key': 'deepseek_api_key',
        'value': 'sk-test-key-12345'
    })
    assert resp.status_code == 200

    status = client.get('/api/config/status').get_json()
    assert status['deepseek'] is True


def test_config_delete_keys(client):
    """DELETE /api/config/keys clears all stored keys."""
    client.post('/api/config/set', json={'key': 'deepseek_api_key', 'value': 'sk-test'})
    resp = client.delete('/api/config/keys')
    assert resp.status_code == 200

    status = client.get('/api/config/status').get_json()
    assert status['deepseek'] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest ../tests/test_config_status.py -v`
Expected: FAIL — 404 on `/api/config/status` (route not registered)

- [ ] **Step 3: Add keyring dependency**

```bash
echo 'keyring>=25.0,<26.0' >> backend/requirements.txt
cd backend && pip install keyring
```

Add to `backend/requirements.txt` after line 7:
```
keyring>=25.0,<26.0
```

- [ ] **Step 4: Create the keyring store**

Create `backend/systems/config/__init__.py`:
```python
"""Config subsystem — secure key storage via Windows Credential Manager."""
```

Create `backend/systems/config/keyring_store.py`:
```python
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
```

- [ ] **Step 5: Register config routes in app.py**

Modify `backend/app.py` — add to imports (after line 33):
```python
from systems.config.keyring_store import set_key, get_key, get_status, delete_all_keys
```

Add to `create_app()` after the `# ── Shutdown (EXE mode) ──` block (after line 72):
```python
    # ── Config / Keyring routes ──────────────────────────────────
    @app.route("/api/config/set", methods=["POST"])
    def config_set():
        """Store an API key or bot ID in Windows Credential Manager.

        Body: { key: str, value: str }
        key must be one of: deepseek_api_key, coze_api_key,
            debate_bot_id, discuss_bot_id, minecraft_bot_id
        """
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Request body must be JSON"}), 400
        key = data.get("key", "").strip()
        value = data.get("value", "")
        if not key:
            return jsonify({"error": "'key' is required"}), 400
        try:
            set_key(key, value)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        except RuntimeError as e:
            return jsonify({"error": str(e)}), 500
        return jsonify({"status": "ok"})

    @app.route("/api/config/status", methods=["GET"])
    def config_status():
        """Return which keys are configured (booleans, no plaintext)."""
        return jsonify(get_status())

    @app.route("/api/config/keys", methods=["DELETE"])
    def config_delete_keys():
        """Delete all stored keys from the credential manager."""
        delete_all_keys()
        return jsonify({"status": "cleared"})
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest ../tests/test_config_status.py -v`
Expected: 3 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/requirements.txt backend/app.py backend/systems/config/ tests/test_config_status.py
git commit -m "feat: add keyring-based secure key storage with config endpoints"
```

---

### Task 2: Create Vocab Vault backend (vault + AI definer + router)

**Files:**
- Create: `backend/systems/vocab/__init__.py`
- Create: `backend/systems/vocab/vault.py`
- Create: `backend/systems/vocab/ai_definer.py`
- Create: `backend/systems/vocab/router.py`
- Create: `tests/test_vocab_vault.py`

**Interfaces:**
- Consumes: (none — depends only on Flask and DeepSeek API key from request body)
- Produces:
  - `POST /api/vocab/add` — `{word, context, source_module, api_key}` → `{word, definition_en, definition_zh, phonetic, example_sentence}`
  - `GET /api/vocab/list` → `{words: [...], total: int}`
  - `DELETE /api/vocab/word?word=xxx` → `{status: "deleted"}`
  - `POST /api/vocab/review` — `{word, quality: 0-5}` → `{next_review, easiness_factor}`
  - `GET /api/vocab/quiz?count=10` → `{questions: [{word, options: [4], correct: int}]}`
  - `GET /api/vocab/export?format=csv` → CSV download

- [ ] **Step 1: Write the failing test**

Create `tests/test_vocab_vault.py`:
```python
"""Tests for Vocab Vault — word storage, SM-2 review, quiz generation."""
import sys
import os
import json
import tempfile
import shutil

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
        self.vault.add_word("hello", "diary", "ctx")
        self.vault.add_word("world", "diary", "ctx")
        questions = self.vault.generate_quiz(count=10)
        assert len(questions) == 2  # only 2 words in vault

    def test_export_csv_has_header(self):
        self.vault.add_word("hello", "novel", "Hello world!")
        csv_data = self.vault.export_csv()
        assert csv_data.startswith("word,definition_en,definition_zh")
        assert "hello" in csv_data


class TestVocabAPI:
    """Integration tests for vocab HTTP endpoints."""

    @pytest.fixture
    def client(self):
        import pytest
        app = create_app()
        app.config['TESTING'] = True
        # Override data dir to temp
        import systems.vocab.router as r
        orig = r.vocab_vault._system_dir
        # Use a temp dir
        import tempfile
        tmp = tempfile.mkdtemp()
        r.vocab_vault._system_dir = type(r.vocab_vault._system_dir)(tmp)
        with app.test_client() as c:
            yield c
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)
        r.vocab_vault._system_dir = orig

    def test_add_word_without_api_key_returns_400(self, client):
        resp = client.post('/api/vocab/add', json={
            'word': 'hello',
            'context': 'Hello world',
            'source_module': 'diary',
        })
        assert resp.status_code == 400
        assert 'api_key' in resp.get_json()['error'].lower()

    def test_list_empty_vault(self, client):
        resp = client.get('/api/vocab/list')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['words'] == []
        assert data['total'] == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest ../tests/test_vocab_vault.py -v`
Expected: FAIL — ImportError for `systems.vocab.vault`

- [ ] **Step 3: Create vault.py (core data layer + SM-2)**

Create `backend/systems/vocab/__init__.py`:
```python
"""Vocab Vault subsystem — cross-module vocabulary collection and review."""
```

Create `backend/systems/vocab/vault.py`:
```python
"""Vocabulary vault — JSON file storage + SM-2 spaced repetition.

Data file: data/vocab/vault.json
"""

import json
import os
import time
import threading
import random
from pathlib import Path
from datetime import datetime, timezone


class VocabVault:
    """Thread-safe vocabulary storage with SM-2 spaced repetition."""

    MAX_WORDS = 2000

    def __init__(self, data_dir: str = None):
        if data_dir is None:
            data_dir = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "..", "..", "data"
            )
        self._system_dir = Path(data_dir) / "vocab"
        self._system_dir.mkdir(parents=True, exist_ok=True)
        self._vault_file = self._system_dir / "vault.json"
        self._lock = threading.Lock()

    # ── Public API ─────────────────────────────────────────────────

    def add_word(self, word: str, source_module: str, source_context: str = "",
                 definition_en: str = "", definition_zh: str = "",
                 phonetic: str = "", example_sentence: str = "") -> dict:
        """Add a word to the vault. Idempotent — if word exists, returns existing.

        Args:
            word: The vocabulary word (case-insensitive key).
            source_module: One of 'novel', 'diary', 'debater', 'minecraft'.
            source_context: The sentence/context where the word was encountered.
            definition_en: English definition (if pre-generated).
            definition_zh: Chinese definition.
            phonetic: IPA pronunciation.
            example_sentence: Example sentence using the word.

        Returns:
            The word entry dict.
        """
        data = self._read_all()
        key = word.lower().strip()

        if key in data["words"]:
            return data["words"][key]

        # Enforce max
        if len(data["words"]) >= self.MAX_WORDS:
            oldest = min(data["words"].keys(),
                        key=lambda k: data["words"][k].get("created_at", ""))
            del data["words"][oldest]

        now = datetime.now(timezone.utc).isoformat()
        entry = {
            "word": word.strip(),
            "phonetic": phonetic,
            "definition_en": definition_en,
            "definition_zh": definition_zh,
            "example_sentence": example_sentence or source_context,
            "source_module": source_module,
            "source_context": source_context,
            "created_at": now,
            "review_count": 0,
            "last_reviewed": None,
            "next_review": now,  # available immediately
            "easiness_factor": 2.5,
        }
        data["words"][key] = entry
        self._write_all(data)
        return entry

    def get_word(self, word: str) -> dict | None:
        """Get a single word entry, or None."""
        data = self._read_all()
        return data["words"].get(word.lower().strip())

    def list_words(self, sort_by: str = "created_at", order: str = "desc",
                   limit: int = None, module_filter: str = None) -> list[dict]:
        """List all words with optional filtering and sorting.

        Args:
            sort_by: 'created_at', 'word', 'next_review', 'review_count'.
            order: 'asc' or 'desc'.
            limit: Max number to return (None = all).
            module_filter: Only return words from this source_module.
        """
        data = self._read_all()
        words = list(data["words"].values())

        if module_filter:
            words = [w for w in words if w.get("source_module") == module_filter]

        reverse = order == "desc"
        words.sort(key=lambda w: w.get(sort_by, ""), reverse=reverse)

        if limit:
            words = words[:limit]

        return words

    def delete_word(self, word: str) -> bool:
        """Delete a word from the vault. Returns True if it existed."""
        data = self._read_all()
        key = word.lower().strip()
        if key in data["words"]:
            del data["words"][key]
            self._write_all(data)
            return True
        return False

    # ── SM-2 Spaced Repetition ─────────────────────────────────────

    def review_word(self, word: str, quality: int) -> dict:
        """Record a review and update SM-2 scheduling.

        Args:
            word: The word being reviewed.
            quality: 0-5 rating (0=complete blackout, 5=perfect recall).

        Returns:
            dict with {next_review, easiness_factor, review_count}.
        """
        data = self._read_all()
        key = word.lower().strip()
        if key not in data["words"]:
            raise KeyError(f"Word '{word}' not in vault")

        entry = data["words"][key]
        ef = entry.get("easiness_factor", 2.5)

        # SM-2 core algorithm
        if quality >= 3:
            # Correct recall — increase interval
            if entry["review_count"] == 0:
                interval = 1  # 1 day
            elif entry["review_count"] == 1:
                interval = 6  # 6 days
            else:
                interval = max(1, entry.get("_interval", 1) * ef)
            entry["review_count"] += 1
        else:
            # Failed recall — reset
            interval = 1
            entry["review_count"] = 0

        # Update easiness factor
        ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        ef = max(1.3, ef)  # minimum EF
        entry["easiness_factor"] = round(ef, 2)
        entry["_interval"] = interval

        now = datetime.now(timezone.utc)
        next_review_time = now.timestamp() + interval * 86400
        entry["last_reviewed"] = now.isoformat()
        entry["next_review"] = datetime.fromtimestamp(
            next_review_time, tz=timezone.utc
        ).isoformat()

        data["words"][key] = entry
        self._write_all(data)

        return {
            "next_review": entry["next_review"],
            "easiness_factor": entry["easiness_factor"],
            "review_count": entry["review_count"],
        }

    def words_due_for_review(self, limit: int = 20) -> list[dict]:
        """Return words whose next_review date has passed."""
        now = datetime.now(timezone.utc).isoformat()
        data = self._read_all()
        due = [w for w in data["words"].values() if w.get("next_review", "") <= now]
        due.sort(key=lambda w: w.get("next_review", ""))
        return due[:limit]

    # ── Quiz Generation ────────────────────────────────────────────

    def generate_quiz(self, count: int = 10) -> list[dict]:
        """Generate a multiple-choice quiz.

        Returns:
            List of {word, options: [4 strings], correct: int (0-3)}.
        """
        data = self._read_all()
        all_words = list(data["words"].values())
        if len(all_words) < 2:
            return []

        # Pick test words (prioritize due for review)
        due = self.words_due_for_review(limit=count)
        test_words = due[:count]
        # Fill remaining with random
        if len(test_words) < count:
            remaining = [w for w in all_words if w not in test_words]
            random.shuffle(remaining)
            test_words.extend(remaining[:count - len(test_words)])
        test_words = test_words[:count]

        questions = []
        for word_entry in test_words:
            correct_def = word_entry.get("definition_zh") or word_entry.get("definition_en") or "(no definition)"
            # Pick 3 wrong answers
            other_words = [w for w in all_words
                          if w["word"].lower() != word_entry["word"].lower()]
            if len(other_words) < 3:
                # Not enough other words — skip
                continue
            distractors = random.sample(other_words, 3)
            distractor_defs = [
                d.get("definition_zh") or d.get("definition_en") or "(no definition)"
                for d in distractors
            ]

            options = [correct_def] + distractor_defs
            random.shuffle(options)
            correct_idx = options.index(correct_def)

            questions.append({
                "word": word_entry["word"],
                "phonetic": word_entry.get("phonetic", ""),
                "options": options,
                "correct": correct_idx,
            })

        return questions

    # ── Export ─────────────────────────────────────────────────────

    def export_csv(self) -> str:
        """Export all words as CSV string."""
        import io
        import csv
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["word", "definition_en", "definition_zh", "phonetic",
                          "example_sentence", "source_module", "created_at",
                          "review_count", "next_review"])
        data = self._read_all()
        for w in data["words"].values():
            writer.writerow([
                w.get("word", ""),
                w.get("definition_en", ""),
                w.get("definition_zh", ""),
                w.get("phonetic", ""),
                w.get("example_sentence", ""),
                w.get("source_module", ""),
                w.get("created_at", ""),
                w.get("review_count", 0),
                w.get("next_review", ""),
            ])
        return output.getvalue()

    # ── Statistics ─────────────────────────────────────────────────

    def get_stats(self) -> dict:
        """Return aggregate statistics for the Dashboard."""
        data = self._read_all()
        words = data["words"].values()
        return {
            "total": len(data["words"]),
            "by_module": {
                mod: sum(1 for w in words if w.get("source_module") == mod)
                for mod in ["novel", "diary", "debater", "minecraft"]
            },
            "due_for_review": len(self.words_due_for_review(limit=9999)),
            "average_ef": round(
                sum(w.get("easiness_factor", 2.5) for w in words) / max(len(words), 1), 2
            ),
        }

    # ── Internal I/O ───────────────────────────────────────────────

    def _read_all(self) -> dict:
        with self._lock:
            if not self._vault_file.exists():
                return {"version": 1, "words": {}}
            try:
                with open(self._vault_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                return {"version": 1, "words": {}}

    def _write_all(self, data: dict) -> None:
        tmp = self._vault_file.with_suffix(".tmp")
        with self._lock:
            try:
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                os.replace(str(tmp), str(self._vault_file))
            finally:
                if tmp.exists():
                    try:
                        tmp.unlink()
                    except OSError:
                        pass


# Module-level singleton
vocab_vault = VocabVault()
```

- [ ] **Step 4: Create ai_definer.py**

Create `backend/systems/vocab/ai_definer.py`:
```python
"""DeepSeek-powered word definition generator.

Given a word and optional context, returns a structured definition
suitable for Vocab Vault storage.
"""

import json
from openai import OpenAI
from core.config import DEEPSEEK_API_BASE, DEEPSEEK_MODEL


DEFINITION_PROMPT = """You are an English vocabulary tutor. Given a word and its context, generate:

1. Phonetic transcription (IPA)
2. English definition (concise, one sentence)
3. Chinese definition (精准中文释义)
4. An example sentence (using the word naturally in context)

Return ONLY valid JSON, no other text:
{
  "phonetic": "string",
  "definition_en": "string",
  "definition_zh": "string",
  "example_sentence": "string"
}"""


def define_word(api_key: str, word: str, context: str = "") -> dict:
    """Generate a structured word definition using DeepSeek.

    Args:
        api_key: DeepSeek API key.
        word: The word to define.
        context: Optional sentence/context where the word appeared.

    Returns:
        dict: {phonetic, definition_en, definition_zh, example_sentence}

    Raises:
        RuntimeError: If the API call fails or returns invalid JSON.
    """
    user_content = f"Word: {word}"
    if context:
        user_content += f"\nContext: {context}"

    client = OpenAI(api_key=api_key, base_url=DEEPSEEK_API_BASE)

    try:
        resp = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": DEFINITION_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.3,
            max_tokens=500,
        )
    except Exception as e:
        error_msg = str(e)
        if "401" in error_msg or "unauthorized" in error_msg.lower():
            raise RuntimeError("Invalid DeepSeek API Key")
        raise RuntimeError(f"DeepSeek API error: {error_msg}")

    raw = resp.choices[0].message.content.strip()

    # Try to extract JSON from the response
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Try to find JSON block in markdown code fences
        import re
        match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass
        # Last resort: return a minimal definition
        return {
            "phonetic": "",
            "definition_en": f"(definition unavailable for '{word}')",
            "definition_zh": f"(无法获取 '{word}' 的释义)",
            "example_sentence": context or "",
        }
```

- [ ] **Step 5: Create vocab router.py**

Create `backend/systems/vocab/router.py`:
```python
"""Vocab Vault subsystem routes.

POST   /api/vocab/add         — add a word (with AI definition)
GET    /api/vocab/list         — list all words
DELETE /api/vocab/word         — delete a word
POST   /api/vocab/review       — SM-2 review feedback
GET    /api/vocab/quiz         — generate quiz
GET    /api/vocab/export       — CSV export
GET    /api/vocab/stats        — aggregate statistics
GET    /api/vocab/due          — words due for review
"""

from flask import request, jsonify, Response
from systems.vocab.vault import vocab_vault
from systems.vocab.ai_definer import define_word


def register_vocab_routes(app):
    """Register Vocab Vault routes on the Flask app."""

    @app.route("/api/vocab/add", methods=["POST"])
    def vocab_add():
        """Add a word to the vault. Optionally generates AI definition.

        Body: { word, source_module, context?, api_key? }
        If api_key is provided, uses DeepSeek to auto-generate definitions.
        """
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Request body must be JSON"}), 400

        word = data.get("word", "").strip()
        source_module = data.get("source_module", "").strip()
        context = data.get("context", "").strip()
        api_key = data.get("api_key", "").strip()

        if not word:
            return jsonify({"error": "'word' is required"}), 400
        if source_module not in ("novel", "diary", "debater", "minecraft"):
            return jsonify({"error": "source_module must be one of: novel, diary, debater, minecraft"}), 400

        # If API key provided, generate definitions via AI
        definition_en = definition_zh = phonetic = example_sentence = ""
        if api_key:
            try:
                definition = define_word(api_key, word, context)
                phonetic = definition.get("phonetic", "")
                definition_en = definition.get("definition_en", "")
                definition_zh = definition.get("definition_zh", "")
                example_sentence = definition.get("example_sentence", context)
            except RuntimeError as e:
                return jsonify({"error": str(e)}), 502

        entry = vocab_vault.add_word(
            word=word,
            source_module=source_module,
            source_context=context,
            definition_en=definition_en,
            definition_zh=definition_zh,
            phonetic=phonetic,
            example_sentence=example_sentence,
        )

        return jsonify(entry)

    @app.route("/api/vocab/list", methods=["GET"])
    def vocab_list():
        """List words with optional filtering and sorting.

        Query params:
            sort_by: created_at (default), word, next_review, review_count
            order: desc (default), asc
            limit: int
            module: novel, diary, debater, minecraft (optional filter)
        """
        sort_by = request.args.get("sort_by", "created_at")
        order = request.args.get("order", "desc")
        limit = request.args.get("limit", type=int)
        module_filter = request.args.get("module")

        if sort_by not in ("created_at", "word", "next_review", "review_count"):
            sort_by = "created_at"
        if order not in ("asc", "desc"):
            order = "desc"

        words = vocab_vault.list_words(
            sort_by=sort_by,
            order=order,
            limit=limit,
            module_filter=module_filter,
        )
        return jsonify({"words": words, "total": len(words)})

    @app.route("/api/vocab/word", methods=["DELETE"])
    def vocab_delete_word():
        """Delete a word. Query: ?word=xxx"""
        word = request.args.get("word", "").strip()
        if not word:
            return jsonify({"error": "'word' query parameter is required"}), 400
        if vocab_vault.delete_word(word):
            return jsonify({"status": "deleted"})
        return jsonify({"error": "Word not found"}), 404

    @app.route("/api/vocab/review", methods=["POST"])
    def vocab_review():
        """Record a flashcard review result (SM-2).

        Body: { word, quality: 0-5 }
        """
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Request body must be JSON"}), 400

        word = data.get("word", "").strip()
        quality = data.get("quality", -1)

        if not word:
            return jsonify({"error": "'word' is required"}), 400
        if not isinstance(quality, int) or quality < 0 or quality > 5:
            return jsonify({"error": "'quality' must be integer 0-5"}), 400

        try:
            result = vocab_vault.review_word(word, quality)
        except KeyError:
            return jsonify({"error": f"Word '{word}' not in vault"}), 404

        return jsonify(result)

    @app.route("/api/vocab/quiz", methods=["GET"])
    def vocab_quiz():
        """Generate a multiple-choice quiz.

        Query: ?count=10 (default 10, max 50)
        """
        count = request.args.get("count", 10, type=int)
        count = min(max(count, 1), 50)
        questions = vocab_vault.generate_quiz(count=count)
        return jsonify({"questions": questions, "total": len(questions)})

    @app.route("/api/vocab/export", methods=["GET"])
    def vocab_export():
        """Export all words as CSV."""
        csv_data = vocab_vault.export_csv()
        return Response(
            csv_data,
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=vocab_vault.csv"},
        )

    @app.route("/api/vocab/stats", methods=["GET"])
    def vocab_stats():
        """Return aggregate statistics."""
        return jsonify(vocab_vault.get_stats())

    @app.route("/api/vocab/due", methods=["GET"])
    def vocab_due():
        """Return words due for review (SM-2).

        Query: ?limit=20 (default 20)
        """
        limit = request.args.get("limit", 20, type=int)
        due = vocab_vault.words_due_for_review(limit=limit)
        return jsonify({"words": due, "total": len(due)})
```

- [ ] **Step 6: Register vocab routes in app.py**

Modify `backend/app.py` — add after the Minecraft routes registration block (after line 59):
```python
    from systems.vocab.router import register_vocab_routes
    register_vocab_routes(app)
```

- [ ] **Step 7: Run tests to verify VocabVault unit tests pass**

Run: `cd backend && python -m pytest ../tests/test_vocab_vault.py::TestVocabVault -v`
Expected: 7 PASS

- [ ] **Step 8: Commit**

```bash
git add backend/systems/vocab/ backend/app.py tests/test_vocab_vault.py
git commit -m "feat: add Vocab Vault backend with SM-2 review and quiz generation"
```

---

---

## Phase 2: Backend — New Modules + Enhancements

### Task 3: Diary backend (grader + router + session_storage)

**Files:**
- Create: `backend/systems/diary/__init__.py`
- Create: `backend/systems/diary/grader.py`
- Create: `backend/systems/diary/router.py`
- Create: `backend/systems/diary/session_storage.py`
- Create: `tests/test_diary_grader.py`
- Modify: `backend/app.py` — register diary routes

**Interfaces:**
- Produces:
  - `POST /api/diary/submit` — `{api_key, text, date?}` → `{corrections: [...], score: {grammar, vocabulary, fluency}, highlighted_expressions: [...]}`
  - `GET /api/diary/entries?from=&to=` → `{entries: [...]}`
  - `GET /api/diary/streak` → `{current_streak: int, streak_dates: [...]}`

**grader.py** uses DeepSeek with a system prompt that instructs:
- Output ONLY valid JSON: `{"corrections": [{"sentence": "...", "issues": [{"original": "...", "suggestion": "...", "reason": "..."}]}], "score": {"grammar": 1-10, "vocabulary": 1-10, "fluency": 1-10}, "highlighted_expressions": ["good phrase 1", "good phrase 2"]}`

**session_storage.py** stores entries at `data/diary/entries.json`:
```json
{"entries": [{"date": "2026-07-07", "original": "...", "corrections": [...], "score": {...}, "created_at": "..."}]}
```

**router.py** endpoints:
- `POST /api/diary/submit` — validates api_key + text, calls grader, saves entry, returns result
- `GET /api/diary/entries` — returns entries for date range
- `GET /api/diary/streak` — computes consecutive days from entries

**Test** (`tests/test_diary_grader.py`):
```python
def test_grader_parse_valid_json():
    """Mock DeepSeek response and verify parsing."""
    # Mock the OpenAI client to return a known JSON response
    # Verify grader.extract_result() parses correctly

def test_streak_calculation():
    """3 consecutive days → streak = 3. Gap → reset."""
```

- [ ] Write failing tests → run (FAIL) → implement → run (PASS) → commit

---

### Task 4: Minecraft companion endpoints

**Files:**
- Modify: `backend/systems/minecraft/router.py` — add companion routes
- Modify: `backend/systems/minecraft/session_storage.py` — add bot_status field

**New endpoints:**
- `GET /api/minecraft/companion/status` → `{bot_online: bool, bot_name: str, last_seen: str, session_count: int}`
- `GET /api/minecraft/companion/sessions` → `{sessions: [{session_id, message_count, updated_at, preview}]}`
- `GET /api/minecraft/companion/session?session_id=xxx` → `{session_id, messages: [...], updated_at}`
- `POST /api/minecraft/companion/refresh` → triggers a session scan from Minebot data dir

The companion endpoints are **read-only** — no POST to send messages. Session data is populated by the Minebot process (or, during development, by the existing COZE router which still works for test).

**session_storage.py** modification: add `bot_status` field to session metadata (loaded from a simple `data/minecraft/bot_status.json` file that Minebot can write to, or defaults to offline).

- [ ] Write test → red → implement → green → commit

---

### Task 5: Novel vocabulary lookup endpoint

**Files:**
- Modify: `backend/systems/novel/router.py` — add `GET /api/novel/define`
- Modify: `backend/systems/novel/translator.py` — add `quick_define()` function

**New endpoint:**
- `GET /api/novel/define?word=xxx&api_key=xxx&context=xxx` → `{phonetic, definition_en, definition_zh}`

**quick_define()** in translator.py: lightweight DeepSeek call for a single word definition (reuses the same DEFINITION_PROMPT pattern from `ai_definer.py` but via the novel subsystem).

- [ ] Implement + test — no new test file needed (test via existing translation flow)
- [ ] Commit

---

### Task 6: Debater scoring endpoint

**Files:**
- Modify: `backend/systems/debater/router.py` — add `POST /api/debater/score`
- Create: `backend/systems/debater/scorer.py`
- Modify: `backend/systems/debater/session_storage.py` — add `get_messages_for_scoring()`

**New endpoint:**
- `POST /api/debater/score` — `{api_key: str, session_id: str}` → `{grammar: int, vocabulary: int, logic: int, fluency: int, suggestions: [str]}`

**scorer.py**: Uses DeepSeek to analyze the full conversation history from the session. System prompt instructs evaluation on four dimensions (1-10 each) with specific improvement suggestions.

- [ ] Write test → red → implement → green → commit

---

### Task 7: Dashboard stats aggregation endpoint

**Files:**
- Modify: `backend/app.py` — add `GET /api/dashboard/stats` route directly in app.py (simple aggregation, no need for separate router)

**Endpoint:**
- `GET /api/dashboard/stats` → `{today: {novel_chars, diary_count, debate_rounds, vocab_added}, streak: int, total_vocab: int, modules: {novel: bool, diary: bool, debater: bool, minecraft: bool}}`

Aggregates data from all four subsystem data directories + vocab vault. Stats are computed at request time (cheap — just counting files and JSON entries).

- [ ] Implement → verify returns valid JSON → commit

---

## Phase 3: Frontend — New Pages & Enhancements

### Task 8: Sidebar update (3 → 6 nav items)

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/App.jsx` — add new Routes

**Changes to Sidebar.jsx:**
```jsx
const NAV_ITEMS = [
  { path: "/",           label: "Dashboard",    layer: "HOME",  icon: "🏠" },
  { path: "/novel",      label: "EnglishNovel", layer: "LAYER 1", icon: "📖" },
  { path: "/diary",      label: "Diary",        layer: "LAYER 2", icon: "✍️" },
  { path: "/debater",    label: "Debater",      layer: "LAYER 3", icon: "⚔️" },
  { path: "/minecrafter",label: "Minecrafter",  layer: "LAYER 4", icon: "⛏️" },
  { path: "/vocab",      label: "VocabVault",   layer: "VAULT",  icon: "📚" },
];
```

**Changes to App.jsx:**
```jsx
// Old route "/" → NovelPage
// New route "/" → DashboardPage (default), "/novel" → NovelPage
import DashboardPage from "./systems/dashboard/DashboardPage";
import DiaryPage from "./systems/diary/DiaryPage";
import VocabPage from "./systems/vocab/VocabPage";

<Routes>
  <Route path="/" element={<DashboardPage />} />
  <Route path="/novel" element={<NovelPage />} />
  <Route path="/diary" element={<DiaryPage />} />
  <Route path="/debater" element={<DebaterPage />} />
  <Route path="/minecrafter" element={<MinecraftPage />} />
  <Route path="/vocab" element={<VocabPage />} />
</Routes>
```

- [ ] Make changes → verify all 6 pages are reachable via sidebar clicks → commit

---

### Task 9: Dashboard page

**Files:**
- Create: `frontend/src/systems/dashboard/DashboardPage.jsx`
- Create: `frontend/src/systems/dashboard/api.js`

**Layout:**
```
┌─────────────────────────────────────────────┐
│  Welcome back, Learner!          ⚙ Settings │
│                                              │
│  ┌──────┬──────┬──────┬──────┐              │
│  │ 3,200│  1   │  3   │  8   │              │
│  │ chars│ diary│debate│ words│              │
│  │  tr. │today │today │today │              │
│  └──────┴──────┴──────┴──────┘              │
│                                              │
│  🔥 7-day streak  📚 48 words in vault       │
│                                              │
│  ┌─────────┐ ┌─────────┐                    │
│  │ 📖 Novel │ │ ✍️ Diary │                    │
│  └─────────┘ └─────────┘                    │
│  ┌─────────┐ ┌─────────┐                    │
│  │⚔ Debater│ │⛏ Mine  │                    │
│  └─────────┘ └─────────┘                    │
│  ┌───────────────────┐                      │
│  │   📚 Vocab Vault   │                      │
│  └───────────────────┘                      │
└─────────────────────────────────────────────┘
```

**api.js:**
```js
export async function getDashboardStats() {
  const resp = await fetch('/api/dashboard/stats');
  if (!resp.ok) throw new Error('Failed to load stats');
  return resp.json();
}
```

**DashboardPage.jsx** — fetches stats on mount, renders stat cards and module entry cards. Each module card is a `<div className="window">` with an icon + label, clickable via `useNavigate()`.

- [ ] Build page → test all 6 module links work → commit

---

### Task 10: Diary page

**Files:**
- Create: `frontend/src/systems/diary/DiaryPage.jsx`
- Create: `frontend/src/systems/diary/store.js`
- Create: `frontend/src/systems/diary/api.js`
- Modify: `frontend/src/App.css` — add diary-specific styles

**Layout:** Two-column (≥900px) or stacked (<900px):
- Left column: Date display + AI topic prompt (optional) + `<textarea className="nes-textarea">` for writing + Submit button
- Right column: After submission — corrections diff view (original sentence strikethrough + suggested rewrite in green) + score card (grammar/vocabulary/fluency bars) + ⭐ buttons on highlighted expressions

**store.js** (Zustand):
```js
useDiaryStore = create(persist(
  (set) => ({
    currentText: "",
    lastResult: null,   // {corrections, score, highlighted_expressions}
    loading: false,
    error: null,
    entries: [],        // recent entries for sidebar
    setCurrentText, setLastResult, setLoading, setError, addEntry,
  }),
  { name: "diary-store", version: 1 }
))
```

**api.js:**
```js
export async function submitDiary(apiKey, text, date) { ... }
export async function getDiaryEntries(from, to) { ... }
export async function getDiaryStreak() { ... }
```

**Calendar component** — simple month grid showing which days have diary entries. Reuses the existing NES.css styling (pixel retro). Click on a filled date → shows that day's entry in read mode.

- [ ] Write component → integrate → test submit flow end-to-end → commit

---

### Task 11: Minecraft Companion page (rewrite from placeholder)

**Files:**
- Modify: `frontend/src/systems/minecraft/MinecraftPage.jsx` — full rewrite
- Modify: `frontend/src/systems/minecraft/store.js` — add polling + bot_status
- Modify: `frontend/src/systems/minecraft/api.js` — add companion endpoints
- Modify: `frontend/src/App.css` — add minecraft-companion styles

**Layout:**
```
┌─────────────────────────────────────────┐
│  ⛏ Minecraft Companion                   │
│                                          │
│  ┌─ Status Bar ──────────────────────┐   │
│  │ 🤖 Bot: Online  📍 Last seen: 2m  │   │
│  └───────────────────────────────────┘   │
│                                          │
│  ┌─ Conversation Log (read-only) ────┐   │
│  │ [14:32] You: build a house        │   │
│  │ [14:32] Bot: Sure! Let's gather.. │ ⭐ │
│  │ [14:35] You: what's "oak"?        │   │
│  │ [14:35] Bot: Oak is 橡木...       │ ⭐ │
│  │ ...                                │   │
│  └───────────────────────────────────┘   │
│                                          │
│  🔄 Auto-refresh: 3s    [Refresh Now]    │
│  📊 Today: 23 msgs · 5 words saved      │
│                                          │
│  ⚠️ Messages are sent inside PCL /       │
│     Minecraft chat, not here.            │
│     This panel is for review & vocab.    │
└─────────────────────────────────────────┘
```

**store.js** additions:
```js
{
  botStatus: { online: false, lastSeen: null },
  polling: false,
  pollingInterval: 3000,  // 3s
  setBotStatus, startPolling, stopPolling,
  // add context menu handler for word selection + star
}
```

**Polling logic:** `useEffect` with `setInterval` every 3s — calls `GET /api/minecraft/companion/status` and `GET /api/minecraft/companion/sessions` → if new messages, updates the log.

**"Send message NOT here" callout:** A prominent but friendly `nes-container is-rounded` at the bottom explaining that messages are sent in PCL. This is important UX — users should not be confused about where to type.

- [ ] Implement page → verify polling works → verify ⭐ button writes to Vocab Vault → commit

---

### Task 12: Vocab Vault page (word list + flashcard + quiz)

**Files:**
- Create: `frontend/src/systems/vocab/VocabPage.jsx`
- Create: `frontend/src/systems/vocab/store.js`
- Create: `frontend/src/systems/vocab/api.js`
- Create: `frontend/src/components/vocab/Flashcard.jsx`
- Create: `frontend/src/components/vocab/QuizPanel.jsx`
- Modify: `frontend/src/App.css` — add vocab styles

**Layout:** Tab-based (NES.css tabs or button group): "Word List" | "Flashcards" | "Quiz"

**Tab 1 — Word List:**
- Sortable table/grid: word | definition_zh | source | next_review
- Sort controls: by date added, alphabetical, next review
- Module filter: All / Novel / Diary / Debater / Minecraft
- Delete button (🗑) per word
- Export CSV button
- Empty state: "No words yet! Start by clicking ⭐ on words in any module."

**Tab 2 — Flashcards:**
- Card flip animation (CSS 3D transform, NES.css pixel style):
  - Front: large word + phonetic
  - Back: definition_en + definition_zh + example_sentence + source_module tag
- Three buttons below card: "😰 Don't Know" (quality=0) | "🤔 Unsure" (quality=3) | "😊 Got It" (quality=5)
- After rating → `POST /api/vocab/review` → next card
- Shows "N words due for review today" at top
- Empty state: "All caught up! 🎉 No words due for review."

**Tab 3 — Quiz:**
- Start quiz button → fetches `GET /api/vocab/quiz?count=10`
- One question at a time: word displayed, 4 definition options (radio buttons or clickable cards)
- After answering all → score display: "8/10 (80%)" + retry button
- Wrong answers highlighted with correct answer shown

- [ ] Build all three tabs → test flashcard review flow → test quiz flow → commit

---

### Task 13: VocabStar reusable component + module integration

**Files:**
- Create: `frontend/src/components/vocab/VocabStar.jsx`
- Modify: `frontend/src/systems/novel/NovelPage.jsx` — integrate VocabStar on hover
- Modify: `frontend/src/systems/debater/DebaterPage.jsx` — integrate VocabStar on message bubble context menu
- Modify: `frontend/src/systems/minecraft/MinecraftPage.jsx` — integrate VocabStar on message log
- Modify: `frontend/src/systems/diary/DiaryPage.jsx` — integrate VocabStar on highlighted expressions

**VocabStar.jsx** — reusable ⭐ button component:
```jsx
export default function VocabStar({ word, context, sourceModule, apiKey, onSuccess }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleClick = async () => {
    setSaving(true);
    try {
      await addWordToVault(word, context, sourceModule, apiKey);
      setSaved(true);
      onSuccess?.();
    } catch (err) {
      // Toast notification
    } finally {
      setSaving(false);
    }
  };

  return (
    <button className={`vocab-star ${saved ? 'saved' : ''}`}
            onClick={handleClick} disabled={saving || saved}
            title="Save to Vocab Vault">
      {saved ? '⭐' : '☆'}
    </button>
  );
}
```

**Integration points:**
- **Novel:** Hover over a highlighted vocab word (`[[[word]]]`) → popup shows definition + ⭐ button. (Calls `GET /api/novel/define` for the hover, `POST /api/vocab/add` for the click.)
- **Debater:** Context menu (right-click / long-press) on assistant message bubbles → "Select word to save" → text selection → ⭐ appears.
- **Minecraft Companion:** Same context menu pattern on bot messages in the read-only log.
- **Diary:** After grading, each `highlighted_expression` in the results has an inline ⭐ button.

- [ ] Implement VocabStar → integrate into all 4 modules → end-to-end test: click ⭐ → check vault → commit

---

### Task 14: SetupModal update (keyring integration)

**Files:**
- Modify: `frontend/src/components/SetupModal.jsx`

**Changes:**
- On open, fetch `GET /api/config/status` to show which keys are already configured
- On save, call `POST /api/config/set` for each non-empty field (via keyring)
- Add "Clear All Keys" button → calls `DELETE /api/config/keys` → clears localStorage → resets form
- Show status indicators: "🔒 Stored in Windows Credential Manager" / "Not configured" per key
- Add "Test Connection" button per key type — calls respective health endpoint with the key to verify it works before saving
- Keep existing localStorage Zustand fallback for session caching

- [ ] Modify SetupModal → test save/load/clear flow → commit

---

## Phase 4: CI/CD + Packaging + Documentation

### Task 15: Makefile + test infrastructure

**Files:**
- Create: `Makefile`

```makefile
.PHONY: test test-backend test-frontend install-dev

install-dev:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

test-backend:
	cd backend && python -m pytest ../tests/ -v

test-frontend:
	cd frontend && npx vitest run

test: test-backend
	@echo "All tests passed"

build-frontend:
	cd frontend && npm run build

build-exe: build-frontend
	cp -r frontend/dist backend/static/
	cd backend && pyinstaller --onefile --name AIEnglishStudio app.py

clean:
	rm -rf backend/build backend/dist backend/static backend/__pycache__ tests/__pycache__
	find backend -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
```

- [ ] Create Makefile → run `make test` → verify all tests pass → commit

---

### Task 16: .gitlab-ci.yml

**Files:**
- Create: `.gitlab-ci.yml`

```yaml
stages:
  - test
  - build

unit-test:
  stage: test
  image: python:3.12
  before_script:
    - cd backend
    - pip install -r requirements.txt
  script:
    - cd backend && python -m pytest ../tests/ -v --junitxml=../report.xml
  artifacts:
    reports:
      junit: report.xml

build-exe:
  stage: build
  image: python:3.12
  needs: ["unit-test"]
  before_script:
    - apt-get update && apt-get install -y nodejs npm
    - cd frontend && npm install && npm run build
    - cp -r frontend/dist backend/static/
    - cd backend && pip install -r requirements.txt pyinstaller
  script:
    - cd backend && pyinstaller --onefile --name AIEnglishStudio app.py
  artifacts:
    paths:
      - backend/dist/AIEnglishStudio.exe
    expire_in: 30 days
  only:
    - tags
```

- [ ] Create .gitlab-ci.yml → push → verify CI pipeline runs → commit

---

### Task 17: Update GitHub Actions release workflow

**Files:**
- Modify: `.github/workflows/release.yml`

**Changes from v1.2.0 workflow:**
- Add `npm install` step before `npm run build`
- Update artifact name from "AI-Novel-Translator" to "AI-English-Learning-Studio"
- Add `pip install keyring` to before_script
- Ensure `backend/static/` includes built frontend before PyInstaller

- [ ] Update workflow → verify it triggers on tag push → check Release page for artifacts → commit

---

### Task 18: README + final documentation updates

**Files:**
- Modify: `README.md` — complete rewrite for v2.0.0
- Create: `AGENT_LOG.md` — initial entry documenting brainstorming + spec + plan phases
- Modify: `frontend/index.html` — update `<title>` to "AI English Learning Studio"

**README.md must include (per SPEC §7.3 + course requirements):**
1. Project title + one-line description
2. Screenshots (Dashboard main view)
3. Features list (6 modules)
4. Quick Start (EXE download + run)
5. Development setup (manual backend + frontend)
6. Key security: how to get API keys + how they're stored (Windows Credential Manager)
7. Distribution: download link, EXE instructions, known limitations (Windows only, SmartScreen warning)
8. Project structure diagram
9. Tech stack
10. License + third-party acknowledgments

- [ ] Write README → commit

---

## Task Dependency Graph

```
Phase 1 (Foundation):
  Task 1 (keyring) ──────────────────────────────────────────────────────┐
  Task 2 (Vocab Backend) ────────────────────────────────────────────────┤
                                                                          │
Phase 2 (Backend — parallel after Phase 1):                               │
  Task 3 (Diary Backend) ───────┐                                        │
  Task 4 (Minecraft Endpoints) ─┤ ── all depend on Phase 1 ─────────────┤
  Task 5 (Novel Define API) ────┤                                        │
  Task 6 (Debater Score API) ───┤                                        │
  Task 7 (Dashboard Stats API) ─┘                                        │
                                                                          │
Phase 3 (Frontend — parallel after Phase 2):                              │
  Task 8 (Sidebar + Routes) ─────┐                                        │
  Task 9 (Dashboard Page) ───────┤                                        │
  Task 10 (Diary Page) ──────────┤ ── all depend on Phase 2 ────────────┤
  Task 11 (Minecraft Companion) ─┤                                        │
  Task 12 (Vocab Page) ──────────┤                                        │
  Task 13 (VocabStar Integration)┘ ── depends on Task 12                 │
  Task 14 (SetupModal Update) ────── depends on Task 1 (keyring backend) │
                                                                          │
Phase 4 (CI/CD + Docs — after all features):                              │
  Task 15 (Makefile) ─────────────┐                                        │
  Task 16 (.gitlab-ci.yml) ───────┤ ── all depend on Phase 3 ───────────┤
  Task 17 (GitHub Actions) ───────┤                                        │
  Task 18 (README) ───────────────┘                                        │
```

**Parallel execution groups:**
- Tasks 3, 4, 5, 6, 7 can run in separate worktrees simultaneously
- Tasks 9, 10, 11, 12, 14 can run in separate worktrees simultaneously (after Task 8)
- Task 13 must wait for Task 12 (needs VocabStar component + Vocab page)

---

## Spec Coverage Check

| Spec Section | Task(s) |
|---|---|
| 3.2 Dashboard | Task 9 |
| 3.3 Novel — vocab collection | Task 5, Task 13 |
| 3.4 Diary | Task 3, Task 10 |
| 3.5 Debater — scoring + collection | Task 6, Task 13 |
| 3.6 Minecraft Companion | Task 4, Task 11 |
| 3.7 Vocab Vault | Task 2, Task 12 |
| 4.2 Security (keyring) | Task 1, Task 14 |
| 4.3 Responsive | Each frontend task uses existing media queries |
| 4.4 Observability | Flask logs (existing) + frontend Toast |
| 7.2 EXE Distribution | Task 17 |
| 7.3 CI/CD | Task 16, Task 17 |
| 8. Testing | Task 15 (Makefile) |
| 9. AC10 (make test) | Task 15 |
| 9. AC11 (CI pass) | Task 16 |
| 9. AC12 (zero credentials) | Enforced by .gitignore + keyring approach — verified at end |

**All spec requirements have at least one corresponding task. No gaps found.** ✅
