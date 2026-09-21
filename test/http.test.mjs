import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postSystemOne } from '../src/client/http.mjs';

function fakeFetch({ status = 200, json = { answers: {} }, delayMs = 0 } = {}) {
  return async (url, init) => {
    fakeFetch.last = { url, init };
    if (delayMs) await new Promise((r, rej) => {
      const t = setTimeout(r, delayMs);
      init.signal?.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
    });
    return { status, text: async () => JSON.stringify(json) };
  };
}

test('sends bearer auth, JSON body, and parses the response', async () => {
  const f = fakeFetch({ json: { answers: { a: { noul: 0.5 } } } });
  const r = await postSystemOne({ url: 'https://x/y', apiKey: 'K', body: { model: 'm' }, timeoutMs: 1000, fetchImpl: f });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { answers: { a: { noul: 0.5 } } });
  assert.equal(fakeFetch.last.init.headers.Authorization, 'Bearer K');
  assert.equal(fakeFetch.last.init.headers['Content-Type'], 'application/json');
  assert.equal(fakeFetch.last.init.method, 'POST');
  assert.equal(fakeFetch.last.init.body, JSON.stringify({ model: 'm' }));
});

test('non-JSON response yields body null and raw text', async () => {
  const f = async () => ({ status: 502, text: async () => 'bad gateway' });
  const r = await postSystemOne({ url: 'u', apiKey: 'K', body: {}, timeoutMs: 1000, fetchImpl: f });
  assert.equal(r.status, 502);
  assert.equal(r.body, null);
  assert.equal(r.text, 'bad gateway');
});

test('aborts after timeoutMs', async () => {
  const f = fakeFetch({ delayMs: 200 });
  await assert.rejects(
    postSystemOne({ url: 'u', apiKey: 'K', body: {}, timeoutMs: 20, fetchImpl: f }),
    (e) => e.name === 'AbortError',
  );
});
