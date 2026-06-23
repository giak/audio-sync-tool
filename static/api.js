// ─── API client — pure fetch wrapper, zero dependencies ──────────────────

export async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  return res.json();
}
