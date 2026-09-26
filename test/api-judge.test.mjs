import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiJudge, makeApiJudgeDecide } from '../src/bench/api-judge.mjs';
import { buildJudgePrompt } from '../src/bench/llm-judge.mjs';
import { noul, choice } from '../src/client/schema.mjs';

const questions = { narrates_0: noul('Narrates?', { true: 'yes', false: 'no' }), kind_0: choice('Kind?', { narration: 'a', reason: 'b', other: null }) };
const GOOD_TEXT = '{"narrates_0": 0.85, "kind_0": {"choice": "narration", "confidence": 0.7}}';
const TOKEN = 'sk-secret-token-value';
const bearer = { name: 'p', baseUrl: 'https://llm.example.test/anthropic/', authHeader: 'bearer', authTokenEnv: 'P_TOKEN', models: { haiku: 'h' }, pricing: {} };
const native = { name: 'n', baseUrl: null, authHeader: 'x-api-key', authTokenEnv: 'N_KEY', models: { haiku: 'h' }, pricing: {} };

function fakeFetch({ status = 200, body, delayMs = 0, error } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    if (error) throw error;
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return { status, ok: status >= 200 && status < 300, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  };
  return { impl, calls };
}
const okBody = (text = GOOD_TEXT) => ({ model: 'h-1', content: [{ type: 'text', text }], usage: { input_tokens: 111, output_tokens: 22 } });

test('bearer provider: URL without a double slash, bearer auth, and the judge prompt as the body', async () => {
  const f = fakeFetch({ body: okBody() });
  const state = { comments: [{ text: 'x' }] };
  const r = await apiJudge({ state, questions, provider: bearer, env: { P_TOKEN: TOKEN }, model: 'h', fetchImpl: f.impl });
  assert.equal(r.ok, true);
  const { url, init } = f.calls[0];
  assert.equal(url, 'https://llm.example.test/anthropic/v1/messages');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['content-type'], 'application/json');
  assert.equal(init.headers['anthropic-version'], '2023-06-01');
  assert.equal(init.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal('x-api-key' in init.headers, false);
  assert.deepEqual(JSON.parse(init.body), { model: 'h', max_tokens: 512, messages: [{ role: 'user', content: buildJudgePrompt(state, questions) }] });
  assert.equal(JSON.stringify(r).includes(TOKEN), false);
});

test('x-api-key provider defaults to the Anthropic endpoint', async () => {
  const f = fakeFetch({ body: okBody() });
  const r = await apiJudge({ state: {}, questions, provider: native, env: { N_KEY: TOKEN }, model: 'h', fetchImpl: f.impl });
  assert.equal(f.calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(f.calls[0].init.headers['x-api-key'], TOKEN);
  assert.equal('authorization' in f.calls[0].init.headers, false);
  assert.equal(JSON.stringify(r).includes(TOKEN), false);
});

test('a good response parses into answers with latency, usage, and model', async () => {
  const body = okBody();
  body.content = [{ type: 'thinking', thinking: '{"narrates_0": 0.1}' }, { type: 'text', text: '{"narrates_0": 0.85, ' }, { type: 'text', text: '"kind_0": {"choice": "narration", "confidence": 0.7}}' }];
  const r = await apiJudge({ state: {}, questions, provider: native, env: { N_KEY: TOKEN }, model: 'h', fetchImpl: fakeFetch({ body }).impl });
  assert.equal(r.ok, true);
  assert.deepEqual(r.answers.narrates_0, { type: 'noul', noul: 0.85 });
  assert.equal(r.answers.kind_0.choice, 'narration');
  assert.deepEqual(r.meta.usage, { input_tokens: 111, output_tokens: 22 });
  assert.equal(r.meta.model, 'h-1');
  assert.equal(typeof r.meta.latencyMs, 'number');
});

test('failure reasons: no key, http status, timeout, network, unparsable text', async () => {
  const base = { state: {}, questions, provider: native, model: 'h' };
  const env = { N_KEY: TOKEN };
  assert.deepEqual(await apiJudge({ ...base, env: {}, fetchImpl: fakeFetch({ body: okBody() }).impl }), { ok: false, reason: 'no_api_key' });
  const unauthorized = await apiJudge({ ...base, env, fetchImpl: fakeFetch({ status: 401, body: { error: TOKEN } }).impl });
  assert.equal(unauthorized.reason, 'api_http_401');
  assert.equal(JSON.stringify(unauthorized).includes(TOKEN), false);
  assert.equal((await apiJudge({ ...base, env, fetchImpl: fakeFetch({ body: okBody(), delayMs: 200 }).impl, timeoutMs: 20 })).reason, 'api_timeout');
  assert.equal((await apiJudge({ ...base, env, fetchImpl: fakeFetch({ error: new TypeError('down') }).impl })).reason, 'api_network');
  assert.equal((await apiJudge({ ...base, env, fetchImpl: fakeFetch({ body: okBody('no json here') }).impl })).reason, 'judge_parse');
  assert.equal((await apiJudge({ ...base, env, fetchImpl: fakeFetch({ body: 'not json' }).impl })).reason, 'judge_parse');
});

test('makeApiJudgeDecide has decide()\'s signature and logs to <area>-api.jsonl', async () => {
  const d = makeApiJudgeDecide({ provider: native, env: { N_KEY: TOKEN }, model: 'h', fetchImpl: fakeFetch({ body: { content: [{ type: 'text', text: '{"yes": 0.7}' }], usage: { input_tokens: 5, output_tokens: 1 } } }).impl, loadArea: () => import('./fixtures/questions/echo-area.mjs') });
  const dir = await mkdtemp(join(tmpdir(), 'jevapi-'));
  const r = await d('echo', { text: 'yes' }, { config: { logDir: dir }, sessionId: 'sess-a' });
  assert.equal(r.ok, true);
  assert.equal(r.answers.yes.noul, 0.7);
  const raw = await readFile(join(dir, 'echo-api.jsonl'), 'utf8');
  assert.equal(raw.includes(TOKEN), false);
  const line = JSON.parse(raw.trim().split('\n').pop());
  assert.equal(line.area, 'echo');
  assert.equal(line.model, 'h');
  assert.equal(line.sessionId, 'sess-a');
  assert.equal(line.ok, true);
  assert.equal(line.reason, null);
  assert.equal(typeof line.latencyMs, 'number');
  assert.deepEqual(line.usage, { input_tokens: 5, output_tokens: 1 });
  assert.equal(typeof line.ts, 'string');
});
