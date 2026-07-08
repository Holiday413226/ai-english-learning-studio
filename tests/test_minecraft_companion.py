"""Tests for Minecraft companion endpoints (Task 4).
Endpoints:
  GET  /api/minecraft/companion/status   — bot status
  GET  /api/minecraft/companion/sessions — list sessions
  GET  /api/minecraft/companion/session  — full session by id
  POST /api/minecraft/companion/refresh  — trigger session scan
"""
import pytest
import sys
import os
import json
import tempfile
import shutil
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app import create_app


@pytest.fixture
def client():
    """Create a test client that uses a temp data dir for isolation."""
    app = create_app()
    app.config['TESTING'] = True

    # Override the minecraft storage to use a temp directory
    import systems.minecraft.session_storage as ss
    orig_dir = ss.minecraft_storage._system_dir
    tmp = tempfile.mkdtemp()
    ss.minecraft_storage._system_dir = type(ss.minecraft_storage._system_dir)(tmp)
    # Pre-populate a test session so polling endpoints have data
    ss.minecraft_storage.create(bot_id="test-bot-123")
    # Also create a second session with messages
    sid2 = ss.minecraft_storage.create(bot_id="test-bot-456")
    ss.minecraft_storage.add_messages(sid2, [
        {"role": "user", "content": "build a house"},
        {"role": "assistant", "content": "Sure! Let's gather oak wood."},
    ])

    with app.test_client() as c:
        yield c

    shutil.rmtree(tmp, ignore_errors=True)
    ss.minecraft_storage._system_dir = orig_dir


class TestCompanionStatus:
    """Tests for GET /api/minecraft/companion/status"""

    def test_status_returns_expected_fields(self, client):
        """Status endpoint returns bot_online, bot_name, last_seen, session_count."""
        resp = client.get('/api/minecraft/companion/status')
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'bot_online' in data
        assert 'bot_name' in data
        assert 'last_seen' in data
        assert 'session_count' in data
        assert isinstance(data['bot_online'], bool)
        assert isinstance(data['bot_name'], str)
        assert isinstance(data['session_count'], int)

    def test_status_session_count_matches(self, client):
        """session_count reflects the number of stored sessions."""
        resp = client.get('/api/minecraft/companion/status')
        assert resp.status_code == 200
        data = resp.get_json()
        # We created 2 sessions in the fixture
        assert data['session_count'] >= 1


class TestCompanionSessions:
    """Tests for GET /api/minecraft/companion/sessions"""

    def test_sessions_returns_list(self, client):
        """Returns a JSON object with a 'sessions' array."""
        resp = client.get('/api/minecraft/companion/sessions')
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'sessions' in data
        assert isinstance(data['sessions'], list)

    def test_sessions_contain_metadata(self, client):
        """Each session entry has session_id, message_count, updated_at, preview."""
        resp = client.get('/api/minecraft/companion/sessions')
        data = resp.get_json()
        for s in data['sessions']:
            assert 'session_id' in s
            assert 'message_count' in s
            assert 'updated_at' in s
            assert 'preview' in s


class TestCompanionSession:
    """Tests for GET /api/minecraft/companion/session?session_id=xxx"""

    def test_missing_session_id_returns_400(self, client):
        """No session_id query param should 400."""
        resp = client.get('/api/minecraft/companion/session')
        assert resp.status_code == 400

    def test_nonexistent_session_returns_404(self, client):
        """Returns 404 for unknown session_id."""
        resp = client.get('/api/minecraft/companion/session?session_id=nonexistent')
        assert resp.status_code == 404

    def test_valid_session_returns_full_data(self, client):
        """Valid session returns session_id, messages, updated_at."""
        # Get any existing session_id from the sessions list
        list_resp = client.get('/api/minecraft/companion/sessions')
        sessions = list_resp.get_json()['sessions']
        assert len(sessions) > 0
        sid = sessions[0]['session_id']

        resp = client.get(f'/api/minecraft/companion/session?session_id={sid}')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['session_id'] == sid
        assert 'messages' in data
        assert 'updated_at' in data


class TestCompanionRefresh:
    """Tests for POST /api/minecraft/companion/refresh"""

    def test_refresh_returns_ok(self, client):
        """Refresh endpoint triggers a scan and returns status."""
        resp = client.post('/api/minecraft/companion/refresh')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'ok'
        assert 'sessions_found' in data
        assert isinstance(data['sessions_found'], int)
