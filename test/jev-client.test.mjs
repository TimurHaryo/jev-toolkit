import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decide } from '../src/client/jev-client.mjs';
import { DEFAULTS } from '../src/client/config.mjs';

const loadArea = () => import('./fixtures/questions/echo-area.mjs');

async function cfg(overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'jevcli-'));
  return {
    ...DEFAULTS,
    mode: 'live',
    logDir: join(dir, 'logs'),
    recordingsDir: join(dir, 'rec'),
    allowedRoots: ['/allowed'],
    apiKey: 'K',
    disabled: false,
    configMissing: false,
    ...overrides,
  };
}

const okBody = { answers: { yes: { type: 'noul', noul: 0.9 } } };
const fetchOk = async () => ({ status: 200, text: async () => JSON.stringify(okBody) });

test('live call returns answers and meta and writes a log line', async () => {
  const config = await cfg();
  const r = await decide('echo', { text: 'yes' }, { cwd: '/allowed/sub', config, fetchImpl: fetchOk, loadArea, sessionId: 's1' });
  assert.equal(r.ok, true);
  assert.equal(r.answers.yes.noul, 0.9);
  assert.equal(r.meta.model, DEFAULTS.model);
  assert.equal(r.meta.mode, 'live');
  assert.equal(r.meta.truncated, false);
  assert.equal(r.meta.questionVersion, 'test-1');
  const raw = await readFile(join(config.logDir, 'echo.jsonl'), 'utf8');
  const line = JSON.parse(raw.trim());
  assert.equal(line.area, 'echo');
  assert.equal(line.sessionId, 's1');
  assert.equal(line.ok, true);
  assert.equal(typeof line.latencyMs, 'number');
  assert.equal('apiKey' in line, false);
  assert.equal('config' in line, false);
  assert.equal(raw.includes('"K"'), false);
});

test('disabled config short-circuits without calling fetch', async () => {
  const config = await cfg({ disabled: true });
  let called = false;
  const r = await decide('echo', { text: 'x' }, { cwd: '/allowed', config, fetchImpl: async () => { called = true; }, loadArea });
  assert.deepEqual(r, { ok: false, reason: 'disabled' });
  assert.equal(called, false);
});

test('cwd outside allowed roots is refused and logged', async () => {
  const config = await cfg();
  const r = await decide('echo', { text: 'x' }, { cwd: '/elsewhere', config, fetchImpl: fetchOk, loadArea });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_allowed_root');
  const line = JSON.parse((await readFile(join(config.logDir, 'echo.jsonl'), 'utf8')).trim());
  assert.equal(line.reason, 'not_allowed_root');
});

test('missing api key in live mode fails open with no_api_key', async () => {
  const config = await cfg({ apiKey: undefined });
  const r = await decide('echo', { text: 'x' }, { cwd: '/allowed', config, fetchImpl: fetchOk, loadArea });
  assert.equal(r.reason, 'no_api_key');
});

test('5xx is retried once, then reported as http_<status>', async () => {
  const config = await cfg();
  let calls = 0;
  const f = async () => { calls += 1; return { status: 503, text: async () => 'down' }; };
  const r = await decide('echo', { text: 'x' }, { cwd: '/allowed', config, fetchImpl: f, loadArea });
  assert.equal(calls, 2);
  assert.equal(r.reason, 'http_503');
});

test('network error on first try, success on retry', async () => {
  const config = await cfg();
  let calls = 0;
  const f = async () => { calls += 1; if (calls === 1) throw new TypeError('fetch failed'); return fetchOk(); };
  const r = await decide('echo', { text: 'x' }, { cwd: '/allowed', config, fetchImpl: f, loadArea });
  assert.equal(r.ok, true);
  assert.equal(calls, 2);
});

test('timeout twice reports timeout', async () => {
  const config = await cfg({ timeoutMs: 10 });
  const f = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))));
  const r = await decide('echo', { text: 'x' }, { cwd: '/allowed', config, fetchImpl: f, loadArea });
  assert.equal(r.reason, 'timeout');
});

test('schema mismatch is reported with detail', async () => {
  const config = await cfg();
  const f = async () => ({ status: 200, text: async () => JSON.stringify({ answers: { yes: { noul: 7 } } }) });
  const r = await decide('echo', { text: 'x' }, { cwd: '/allowed', config, fetchImpl: f, loadArea });
  assert.equal(r.reason, 'schema');
  assert.match(r.detail, /yes/);
});

test('state over maxStateTokens is truncated via the area module and flagged', async () => {
  const config = await cfg({ maxStateTokens: 5 });
  let sent;
  const f = async (url, init) => { sent = JSON.parse(init.body); return fetchOk(); };
  const r = await decide('echo', { text: 'a very long affirmative sentence' }, { cwd: '/allowed', config, fetchImpl: f, loadArea });
  assert.equal(r.meta.truncated, true);
  assert.equal(sent.state.truncatedBy, 'echo');
});

test('record mode stores the body; replay mode serves it without fetch; replay without recording fails', async () => {
  const config = await cfg({ mode: 'record' });
  await decide('echo', { text: 'yes' }, { cwd: '/allowed', config, fetchImpl: fetchOk, loadArea });
  let called = false;
  const replayCfg = { ...config, mode: 'replay', apiKey: undefined };
  const r = await decide('echo', { text: 'yes' }, { cwd: '/allowed', config: replayCfg, fetchImpl: async () => { called = true; }, loadArea });
  assert.equal(r.ok, true);
  assert.equal(r.meta.mode, 'replay');
  assert.equal(called, false);
  const miss = await decide('echo', { text: 'other' }, { cwd: '/allowed', config: replayCfg, fetchImpl: fetchOk, loadArea });
  assert.equal(miss.reason, 'no_recording');
});

test('unknown area reports area_load', async () => {
  const config = await cfg();
  const r = await decide('does-not-exist', {}, { cwd: '/allowed', config, fetchImpl: fetchOk });
  assert.equal(r.reason, 'area_load');
});

test('area module throwing is reported as internal, not thrown', async () => {
  const config = await cfg({ maxStateTokens: 1 });
  const r = await decide('echo', { text: 42 }, { cwd: '/allowed', config, fetchImpl: fetchOk, loadArea });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'internal');
});

test('unwritable logDir does not change the result', async () => {
  const config = await cfg({ logDir: '/dev/null/nope' });
  const r = await decide('echo', { text: 'yes' }, { cwd: '/allowed', config, fetchImpl: fetchOk, loadArea });
  assert.equal(r.ok, true);
  assert.equal(r.answers.yes.noul, 0.9);
});

test('record mode does not cache a body that fails schema validation', async () => {
  const config = await cfg({ mode: 'record' });
  const f = async () => ({ status: 200, text: async () => JSON.stringify({ answers: { yes: { noul: 7 } } }) });
  const r = await decide('echo', { text: 'yes' }, { cwd: '/allowed', config, fetchImpl: f, loadArea });
  assert.equal(r.reason, 'schema');
  let entries = [];
  try {
    entries = await readdir(join(config.recordingsDir, 'echo'));
  } catch (e) {
    assert.equal(e.code, 'ENOENT');
  }
  assert.deepEqual(entries, []);
});
