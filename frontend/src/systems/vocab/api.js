/**
 * Vocabulary Vault API functions.
 */
const BASE = "/api/vocab";

export async function addWordToVault(word, sourceModule, context, apiKey) {
  const resp = await fetch(`${BASE}/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word, source_module: sourceModule, context, api_key: apiKey }),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function listWords(sortBy = "created_at", order = "desc", moduleFilter) {
  const params = new URLSearchParams({ sort_by: sortBy, order });
  if (moduleFilter) params.set("module", moduleFilter);
  const resp = await fetch(`${BASE}/list?${params}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function deleteWord(word) {
  const resp = await fetch(`${BASE}/word?word=${encodeURIComponent(word)}`, { method: "DELETE" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function reviewWord(word, quality) {
  const resp = await fetch(`${BASE}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word, quality }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function getQuiz(count = 10) {
  const resp = await fetch(`${BASE}/quiz?count=${count}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function getDueWords(limit = 20) {
  const resp = await fetch(`${BASE}/due?limit=${limit}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function getFlashcards(limit = 30) {
  const resp = await fetch(`${BASE}/flashcards?limit=${limit}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function exportCSV() {
  const resp = await fetch(`${BASE}/export`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.blob();
}
