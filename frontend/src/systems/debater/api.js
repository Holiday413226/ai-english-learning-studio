/**
 * HTTP API for the Debater subsystem.
 *
 * All endpoints are under /api/debater/...
 * API key and Bot ID are sent with every request — never stored on the backend.
 */

const API_BASE = "/api/debater";

export async function postChat({ api_key, bot_id, session_id, message, mode, api_url, provider }) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key,
      bot_id,
      session_id,
      message,
      mode,
      api_url,
      provider,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}: Request failed`);
  }

  return data;
}

export async function getSessions() {
  const response = await fetch(`${API_BASE}/sessions`);
  return response.json();
}

export async function getSession(sessionId) {
  const response = await fetch(
    `${API_BASE}/session?session_id=${encodeURIComponent(sessionId)}`
  );
  if (!response.ok) {
    throw new Error(`Session fetch failed: HTTP ${response.status}`);
  }
  return response.json();
}

export async function deleteSessionApi(id) {
  const response = await fetch(
    `${API_BASE}/session?session_id=${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
  return response.json();
}

export async function getDebateScore(apiKey, sessionId) {
  const response = await fetch(`${API_BASE}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      session_id: sessionId,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}
