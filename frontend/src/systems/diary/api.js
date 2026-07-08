/** Diary API functions. */
const BASE = "/api/diary";

export async function submitDiary(apiKey, text, date) {
  const resp = await fetch(`${BASE}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, text, date }),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function getDiaryEntries(from, to) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const resp = await fetch(`${BASE}/entries?${params}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function getDiaryStreak() {
  const resp = await fetch(`${BASE}/streak`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}
