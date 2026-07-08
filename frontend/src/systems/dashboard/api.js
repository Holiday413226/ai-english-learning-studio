/** Dashboard API — fetch aggregate stats. */
export async function getDashboardStats() {
  const resp = await fetch("/api/dashboard/stats");
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${resp.status}`);
  }
  return resp.json();
}
