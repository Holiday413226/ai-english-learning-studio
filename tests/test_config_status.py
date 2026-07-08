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
