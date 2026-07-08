/**
 * HTTP API for the Novel subsystem.
 *
 * All endpoints are under /api/novel/...
 * API key is sent with every request — never stored on the backend.
 */

const API_BASE = "/api/novel";

export async function postTranslate(apiKey, novelText, vocabText, sessionId) {
  const response = await fetch(`${API_BASE}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      novel_text: novelText,
      vocab_text: vocabText,
      session_id: sessionId || "",
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}: Request failed`);
  }

  return data;
}

export async function getNovelSessions() {
  const response = await fetch(`${API_BASE}/sessions`);
  return response.json();
}

export async function getNovelSession(sessionId) {
  const response = await fetch(
    `${API_BASE}/session?session_id=${encodeURIComponent(sessionId)}`
  );
  if (!response.ok) {
    throw new Error(`Session fetch failed: HTTP ${response.status}`);
  }
  return response.json();
}

export async function deleteNovelSession(sessionId) {
  const response = await fetch(
    `${API_BASE}/session?session_id=${encodeURIComponent(sessionId)}`,
    { method: "DELETE" }
  );
  return response.json();
}
