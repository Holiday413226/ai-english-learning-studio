/**
 * HTTP API for the Minecraft subsystem.
 *
 * All endpoints are under /api/minecraft/...
 * API key and Bot ID are sent with every request — never stored on the backend.
 * Companion endpoints are READ-ONLY — messages are sent inside PCL/Minecraft.
 */

const API_BASE = "/api/minecraft";

export async function postChat({ api_key, bot_id, session_id, message, api_url }) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key,
      bot_id,
      session_id,
      message,
      api_url,
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

// ── Companion endpoints (read-only) ──────────────────────────

export async function getCompanionStatus() {
  const resp = await fetch(`${API_BASE}/companion/status`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function getCompanionSessions() {
  const resp = await fetch(`${API_BASE}/companion/sessions`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function getCompanionSession(sessionId) {
  const resp = await fetch(`${API_BASE}/companion/session?session_id=${encodeURIComponent(sessionId)}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// ── Bridge control endpoints ────────────────────────────────────

export async function getBridgeStatus() {
  const resp = await fetch(`${API_BASE}/bridge/status`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function startMinebotBridge() {
  const resp = await fetch(`${API_BASE}/bridge/start`, { method: "POST" });
  return resp.json();
}

export async function stopMinebotBridge() {
  const resp = await fetch(`${API_BASE}/bridge/stop`, { method: "POST" });
  return resp.json();
}

// ── Layer selector endpoints ────────────────────────────────────

export async function getLayers() {
  const resp = await fetch(`${API_BASE}/layers`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function setLayers(layers) {
  const resp = await fetch(`${API_BASE}/layers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ layers }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || `HTTP ${resp.status}`);
  }
  return data;
}
