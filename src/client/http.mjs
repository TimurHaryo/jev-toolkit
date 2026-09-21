/** One POST to the systemone endpoint. Throws on abort or network error; returns non-2xx as data. */
export async function postSystemOne({ url, apiKey, body, timeoutMs, fetchImpl = fetch }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    return { status: res.status, body: parsed, text };
  } finally {
    clearTimeout(timer);
  }
}
