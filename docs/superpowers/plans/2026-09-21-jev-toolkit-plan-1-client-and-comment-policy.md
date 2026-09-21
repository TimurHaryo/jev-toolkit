# JEV Toolkit Plan 1: Client and Comment-Policy Adapter

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A zero-dependency Node client for Jev's `systemone` endpoint, a smoke command, and a working PreToolUse hook that denies Kotlin writes containing narration comments, with labeled fixtures and an accuracy script.

**Architecture:** `src/client/` wraps one HTTPS call with guard, timeout, retry, record/replay, truncation, and JSONL logging behind `decide(area, state, opts)`. Each area is a module in `src/questions/` exporting `buildQuestions(state)`, `truncate(state)`, `thresholds`, `version`. Adapters in `src/adapters/<area>/` are thin: parse hook stdin, build state, call `decide`, emit the hook JSON. Pure decision logic lives in its own module so it is tested without I/O.

**Tech Stack:** Node 20+ ES modules (`.mjs`), built-in `fetch`, `node:test`, `node:crypto`, `node:fs/promises`. No npm packages.

**Spec:** `docs/superpowers/specs/2026-09-21-jev-toolkit-design.md` (sections 5, 6, 7.1, 8.1, 10.6, 11, 13).

## Global Constraints

- Never write under `<work checkout>/` or `<work checkout copy>/`. This plan touches only `~/Project/JEV`.
- No `npm install`. `package.json` has no `dependencies` and no `devDependencies`.
- `TYPESAFE_API_KEY` is read from the environment only and is not present on this machine. All tests inject a fake `fetch` or run with `JEV_MODE=replay`.
- Jev model pin default: `jev-1.13.0`. Endpoint default: `https://api.typesafe.ai/v1/systemone`.
- Client defaults: `timeoutMs` 3000, one retry, `maxStateTokens` 24000, fail open.
- Comment-policy thresholds: `deny` 0.80, `advise` 0.50. Max 20 comments per Jev call.
- Hook must never stall a session: every error path exits 0 with allow.
- Commit as `timurharyo00@gmail.com` (already set in the repo). Conventional commit prefixes.
- Run all tests with `node --test` from the repo root.

---

## File structure

```
package.json                          scripts only
.env.example                          TYPESAFE_API_KEY=
jev.config.example.json               committed template of the device-local config
README.md                             what this is, how to dry-run the hook
bin/jev-smoke.mjs                     live smoke call
bin/jev-accuracy.mjs                  fixtures → accuracy report
bin/jev-hook-comment-policy.mjs       hook entry (thin wrapper around the adapter)
src/client/config.mjs                 loadConfig, DEFAULTS, toolkitRoot
src/client/guard.mjs                  isAllowedRoot, assertAllowedRoot, NotAllowedRoot
src/client/tokens.mjs                 estimateTokens
src/client/schema.mjs                 noul, choice, score, buildRequest, validateAnswers
src/client/http.mjs                   postSystemOne (single call, AbortController)
src/client/recorder.mjs               recordingKey, readRecording, writeRecording
src/client/log.mjs                    appendLog
src/client/jev-client.mjs             decide
src/client/smoke.mjs                  buildSmokeRequest, formatSmokeReport
src/hooks/io.mjs                      readStdinJson, writeHookOutput, EXIT
src/questions/comment-policy.mjs      area module
src/adapters/comment-policy/comments.mjs      extractComments
src/adapters/comment-policy/filters.mjs       applyFilters, RULES
src/adapters/comment-policy/decision.mjs      evaluate, formatReason
src/adapters/comment-policy/session-state.mjs editHash, bumpDenyCount
src/adapters/comment-policy/hook.mjs          runCommentPolicy
src/bench/accuracy.mjs                compareCase, summarize, formatReport
fixtures/comment-policy/cases.jsonl   40 labeled comments
fixtures/recordings/.gitkeep
examples/settings.comment-policy.json hook wiring for a local dry run
test/*.test.mjs                       one file per module
```

---

### Task 1: Scaffold and config loader

**Files:**
- Create: `package.json`, `.env.example`, `jev.config.example.json`, `fixtures/recordings/.gitkeep`
- Create: `src/client/config.mjs`
- Test: `test/config.test.mjs`

**Interfaces:**
- Produces: `DEFAULTS` object; `toolkitRoot(): string`; `loadConfig({ env?, configPath? }): Config` where `Config = { mode, model, baseUrl, timeoutMs, maxStateTokens, contextBudgetTokens, logDir, allowedRoots, recordingsDir, apiKey, disabled, configMissing }`. `logDir` and `recordingsDir` are absolute.

- [ ] **Step 1: Write package.json, env example, config example, gitkeep**

`package.json`:
```json
{
  "name": "jev-toolkit",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test",
    "smoke": "node bin/jev-smoke.mjs",
    "accuracy": "node bin/jev-accuracy.mjs"
  }
}
```

`.env.example`:
```
TYPESAFE_API_KEY=
```

`jev.config.example.json`:
```json
{
  "mode": "live",
  "model": "jev-1.13.0",
  "baseUrl": "https://api.typesafe.ai/v1/systemone",
  "timeoutMs": 3000,
  "maxStateTokens": 24000,
  "contextBudgetTokens": 6000,
  "logDir": "logs",
  "allowedRoots": ["/absolute/path/to/WebSocket Inspector"]
}
```

`fixtures/recordings/.gitkeep`: empty file.

- [ ] **Step 2: Write the failing test**

`test/config.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { DEFAULTS, loadConfig, toolkitRoot } from '../src/client/config.mjs';

test('toolkitRoot points at the directory holding package.json', async () => {
  const root = toolkitRoot();
  assert.ok(isAbsolute(root));
  const { readFile } = await import('node:fs/promises');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'jev-toolkit');
});

test('loadConfig merges file over DEFAULTS and resolves dirs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jevcfg-'));
  const path = join(dir, 'jev.config.json');
  await writeFile(path, JSON.stringify({ timeoutMs: 1234, allowedRoots: ['/tmp/x'], logDir: 'mylogs' }));
  const cfg = loadConfig({ env: { TYPESAFE_API_KEY: 'k' }, configPath: path });
  assert.equal(cfg.timeoutMs, 1234);
  assert.equal(cfg.model, DEFAULTS.model);
  assert.deepEqual(cfg.allowedRoots, ['/tmp/x']);
  assert.equal(cfg.logDir, join(dir, 'mylogs'));
  assert.equal(cfg.recordingsDir, join(toolkitRoot(), 'fixtures', 'recordings'));
  assert.equal(cfg.apiKey, 'k');
  assert.equal(cfg.disabled, false);
  assert.equal(cfg.configMissing, false);
});

test('loadConfig with a missing file falls back to DEFAULTS and flags it', () => {
  const cfg = loadConfig({ env: {}, configPath: '/nonexistent/jev.config.json' });
  assert.equal(cfg.configMissing, true);
  assert.deepEqual(cfg.allowedRoots, []);
  assert.equal(cfg.apiKey, undefined);
});

test('env overrides: JEV_MODE, JEV_LOG_DIR, JEV_DISABLE, JEV_CONFIG', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jevcfg-'));
  const path = join(dir, 'c.json');
  await writeFile(path, JSON.stringify({ mode: 'live' }));
  const cfg = loadConfig({ env: { JEV_CONFIG: path, JEV_MODE: 'replay', JEV_LOG_DIR: '/tmp/jevlogs', JEV_DISABLE: '1' } });
  assert.equal(cfg.mode, 'replay');
  assert.equal(cfg.logDir, '/tmp/jevlogs');
  assert.equal(cfg.disabled, true);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/config.test.mjs`
Expected: FAIL, cannot find module `../src/client/config.mjs`.

- [ ] **Step 4: Write the implementation**

`src/client/config.mjs`:
```js
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULTS = Object.freeze({
  mode: 'live',
  model: 'jev-1.13.0',
  baseUrl: 'https://api.typesafe.ai/v1/systemone',
  timeoutMs: 3000,
  maxStateTokens: 24000,
  contextBudgetTokens: 6000,
  logDir: 'logs',
  allowedRoots: [],
});

const MODES = new Set(['live', 'record', 'replay']);

/** Absolute path of the directory that holds package.json. */
export function toolkitRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function readJsonIfPresent(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function resolveDir(base, value) {
  return isAbsolute(value) ? value : join(base, value);
}

/**
 * Loads jev.config.json (device-local) over DEFAULTS, then applies env overrides.
 * Never throws for a missing file: returns DEFAULTS with configMissing = true so hooks fail open.
 */
export function loadConfig({ env = process.env, configPath } = {}) {
  const path = configPath ?? env.JEV_CONFIG ?? join(toolkitRoot(), 'jev.config.json');
  const fromFile = readJsonIfPresent(path);
  const base = { ...DEFAULTS, ...(fromFile ?? {}) };
  const configDir = fromFile ? dirname(path) : toolkitRoot();
  const mode = MODES.has(env.JEV_MODE) ? env.JEV_MODE : base.mode;
  return {
    ...base,
    mode,
    logDir: resolveDir(configDir, env.JEV_LOG_DIR ?? base.logDir),
    recordingsDir: join(toolkitRoot(), 'fixtures', 'recordings'),
    allowedRoots: [...base.allowedRoots],
    apiKey: env.TYPESAFE_API_KEY,
    disabled: env.JEV_DISABLE === '1',
    configMissing: fromFile === null,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/config.test.mjs`
Expected: 4 passing.

- [ ] **Step 6: Commit**

```bash
git add package.json .env.example jev.config.example.json fixtures/recordings/.gitkeep src/client/config.mjs test/config.test.mjs
git commit -m "feat: scaffold toolkit and config loader"
```

---

### Task 2: Root guard and token estimate

**Files:**
- Create: `src/client/guard.mjs`, `src/client/tokens.mjs`
- Test: `test/guard.test.mjs`, `test/tokens.test.mjs`

**Interfaces:**
- Produces: `isAllowedRoot(cwd: string, roots: string[]): boolean`; `assertAllowedRoot(cwd, roots): void` throws `NotAllowedRoot` (has `.code = 'not_allowed_root'`); `estimateTokens(value: unknown): number`.

- [ ] **Step 1: Write the failing tests**

`test/guard.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedRoot, assertAllowedRoot, NotAllowedRoot } from '../src/client/guard.mjs';

test('cwd equal to a root is allowed', () => {
  assert.equal(isAllowedRoot('/a/b', ['/a/b']), true);
});

test('cwd inside a root is allowed, sibling with shared prefix is not', () => {
  assert.equal(isAllowedRoot('/a/b/c', ['/a/b']), true);
  assert.equal(isAllowedRoot('/a/bc', ['/a/b']), false);
});

test('empty roots allow nothing', () => {
  assert.equal(isAllowedRoot('/a', []), false);
});

test('relative paths and trailing slashes are normalised', () => {
  assert.equal(isAllowedRoot('/a/b/./c', ['/a/b/']), true);
});

test('assertAllowedRoot throws NotAllowedRoot with code', () => {
  assert.throws(() => assertAllowedRoot('/x', ['/a']), (e) => e instanceof NotAllowedRoot && e.code === 'not_allowed_root');
});
```

`test/tokens.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens } from '../src/client/tokens.mjs';

test('strings estimate at one token per four characters, rounded up', () => {
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2);
  assert.equal(estimateTokens(''), 0);
});

test('objects are measured as their JSON', () => {
  assert.equal(estimateTokens({ a: 1 }), Math.ceil('{"a":1}'.length / 4));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/guard.test.mjs test/tokens.test.mjs`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the implementations**

`src/client/guard.mjs`:
```js
import { resolve, sep } from 'node:path';

/** Thrown when the current directory is not under any configured target root. */
export class NotAllowedRoot extends Error {
  constructor(cwd) {
    super(`JEV refused: ${cwd} is not under an allowed root`);
    this.code = 'not_allowed_root';
  }
}

export function isAllowedRoot(cwd, roots) {
  const target = resolve(cwd);
  return roots.some((root) => {
    const r = resolve(root);
    return target === r || target.startsWith(r + sep);
  });
}

export function assertAllowedRoot(cwd, roots) {
  if (!isAllowedRoot(cwd, roots)) throw new NotAllowedRoot(cwd);
}
```

`src/client/tokens.mjs`:
```js
const CHARS_PER_TOKEN = 4;

/** Rough token estimate used only for truncation decisions, never for billing. */
export function estimateTokens(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/guard.test.mjs test/tokens.test.mjs`
Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
git add src/client/guard.mjs src/client/tokens.mjs test/guard.test.mjs test/tokens.test.mjs
git commit -m "feat: allowed-root guard and token estimate"
```

---

### Task 3: Request builders and answer validation

**Files:**
- Create: `src/client/schema.mjs`
- Test: `test/schema.test.mjs`

**Interfaces:**
- Produces: `noul(instructions, criteria?)`, `choice(instructions, criteria)`, `score(instructions, levels)`, `buildRequest({ model, state, questions })`, `validateAnswers(questions, body): { ok: true, answers } | { ok: false, reason: 'schema', detail }`.
- Question shapes: `{ type: 'noul', instructions, criteria?: { true, false } }`, `{ type: 'choice', instructions, criteria: { [option]: string | null } }`, `{ type: 'score', instructions, criteria: string[] }`.
- Answer shapes accepted: noul `{ noul: number }`; choice `{ choice: string, probabilities: object, confidence: number }`; score `{ score: number, probabilities, confidence }`.

- [ ] **Step 1: Write the failing test**

`test/schema.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noul, choice, score, buildRequest, validateAnswers } from '../src/client/schema.mjs';

const questions = {
  urgent: noul('Is it urgent?', { true: 'Deadline today', false: 'No deadline' }),
  dept: choice('Which team?', { billing: 'Money', tech: 'Bugs', other: null }),
  severity: score('How bad?', ['Cosmetic', 'Degraded', 'Blocking']),
};

test('builders produce the documented shapes', () => {
  assert.deepEqual(questions.urgent, { type: 'noul', instructions: 'Is it urgent?', criteria: { true: 'Deadline today', false: 'No deadline' } });
  assert.deepEqual(noul('x'), { type: 'noul', instructions: 'x' });
  assert.equal(questions.dept.type, 'choice');
  assert.deepEqual(questions.severity.criteria, ['Cosmetic', 'Degraded', 'Blocking']);
});

test('buildRequest carries model, state and questions verbatim', () => {
  const req = buildRequest({ model: 'jev-1.13.0', state: { a: 1 }, questions });
  assert.deepEqual(req, { model: 'jev-1.13.0', state: { a: 1 }, questions });
});

test('validateAnswers accepts a well-formed body', () => {
  const body = { answers: {
    urgent: { type: 'noul', noul: 0.93 },
    dept: { type: 'choice', choice: 'tech', probabilities: { billing: 0.1, tech: 0.8, other: 0.1 }, confidence: 0.7 },
    severity: { type: 'score', score: 1.4, probabilities: [0.1, 0.4, 0.5], confidence: 0.6 },
  } };
  const r = validateAnswers(questions, body);
  assert.equal(r.ok, true);
  assert.equal(r.answers.dept.choice, 'tech');
});

test('validateAnswers rejects missing question, out-of-range noul, unknown choice', () => {
  assert.equal(validateAnswers(questions, { answers: {} }).ok, false);
  assert.equal(validateAnswers(questions, { answers: { urgent: { noul: 1.5 }, dept: { choice: 'tech', probabilities: {}, confidence: 1 }, severity: { score: 1, probabilities: [], confidence: 1 } } }).ok, false);
  const bad = validateAnswers(questions, { answers: { urgent: { noul: 0.5 }, dept: { choice: 'nope', probabilities: {}, confidence: 1 }, severity: { score: 1, probabilities: [], confidence: 1 } } });
  assert.equal(bad.ok, false);
  assert.match(bad.detail, /dept/);
});

test('validateAnswers rejects a non-object body', () => {
  assert.equal(validateAnswers(questions, null).ok, false);
  assert.equal(validateAnswers(questions, 'text').ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/schema.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`src/client/schema.mjs`:
```js
export function noul(instructions, criteria) {
  return criteria ? { type: 'noul', instructions, criteria } : { type: 'noul', instructions };
}

export function choice(instructions, criteria) {
  return { type: 'choice', instructions, criteria };
}

export function score(instructions, levels) {
  return { type: 'score', instructions, criteria: levels };
}

export function buildRequest({ model, state, questions }) {
  return { model, state, questions };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const inUnit = (v) => isNum(v) && v >= 0 && v <= 1;

function problem(id, q, a) {
  if (!a || typeof a !== 'object') return `${id}: missing answer`;
  if (q.type === 'noul') return inUnit(a.noul) ? null : `${id}: noul must be a number in [0,1]`;
  if (q.type === 'choice') {
    if (!Object.prototype.hasOwnProperty.call(q.criteria, a.choice)) return `${id}: choice "${a.choice}" not in options`;
    if (!a.probabilities || typeof a.probabilities !== 'object') return `${id}: probabilities missing`;
    return inUnit(a.confidence) ? null : `${id}: confidence must be in [0,1]`;
  }
  if (q.type === 'score') {
    if (!isNum(a.score)) return `${id}: score must be a number`;
    if (!a.probabilities) return `${id}: probabilities missing`;
    return inUnit(a.confidence) ? null : `${id}: confidence must be in [0,1]`;
  }
  return `${id}: unknown question type ${q.type}`;
}

/** Structural check only. A valid shape says nothing about whether the answer is right. */
export function validateAnswers(questions, body) {
  if (!body || typeof body !== 'object' || !body.answers || typeof body.answers !== 'object') {
    return { ok: false, reason: 'schema', detail: 'body.answers is not an object' };
  }
  const problems = Object.entries(questions)
    .map(([id, q]) => problem(id, q, body.answers[id]))
    .filter(Boolean);
  if (problems.length) return { ok: false, reason: 'schema', detail: problems.join('; ') };
  return { ok: true, answers: body.answers };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/schema.test.mjs`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/client/schema.mjs test/schema.test.mjs
git commit -m "feat: question builders and answer validation"
```

---

### Task 4: HTTP call and recorder

**Files:**
- Create: `src/client/http.mjs`, `src/client/recorder.mjs`
- Test: `test/http.test.mjs`, `test/recorder.test.mjs`

**Interfaces:**
- Produces: `postSystemOne({ url, apiKey, body, timeoutMs, fetchImpl }): Promise<{ status: number, body: object | null, text: string }>`; throws the underlying error on abort or network failure (the caller decides about retries).
- Produces: `recordingKey(state, questions): string` (sha256 hex); `recordingPath(dir, area, key)`; `readRecording(dir, area, key): Promise<object | null>`; `writeRecording(dir, area, key, body): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

`test/http.test.mjs`:
```js
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
```

`test/recorder.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordingKey, recordingPath, readRecording, writeRecording } from '../src/client/recorder.mjs';

test('key is stable for equal inputs and differs when state changes', () => {
  const q = { a: { type: 'noul', instructions: 'x' } };
  assert.equal(recordingKey({ s: 1 }, q), recordingKey({ s: 1 }, q));
  assert.notEqual(recordingKey({ s: 1 }, q), recordingKey({ s: 2 }, q));
  assert.match(recordingKey({ s: 1 }, q), /^[0-9a-f]{64}$/);
});

test('recordingPath nests by area', () => {
  assert.equal(recordingPath('/r', 'comment-policy', 'abc'), join('/r', 'comment-policy', 'abc.json'));
});

test('write then read round-trips; missing returns null', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jevrec-'));
  assert.equal(await readRecording(dir, 'area', 'k1'), null);
  await writeRecording(dir, 'area', 'k1', { answers: { a: { noul: 0.1 } } });
  assert.deepEqual(await readRecording(dir, 'area', 'k1'), { answers: { a: { noul: 0.1 } } });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/http.test.mjs test/recorder.test.mjs`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the implementations**

`src/client/http.mjs`:
```js
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
```

`src/client/recorder.mjs`:
```js
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export function recordingKey(state, questions) {
  return createHash('sha256').update(JSON.stringify({ state, questions })).digest('hex');
}

export function recordingPath(dir, area, key) {
  return join(dir, area, `${key}.json`);
}

export async function readRecording(dir, area, key) {
  try {
    return JSON.parse(await readFile(recordingPath(dir, area, key), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

export async function writeRecording(dir, area, key, body) {
  const path = recordingPath(dir, area, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(body, null, 2));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/http.test.mjs test/recorder.test.mjs`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/client/http.mjs src/client/recorder.mjs test/http.test.mjs test/recorder.test.mjs
git commit -m "feat: systemone http call and record/replay store"
```

---

### Task 5: Logger and the `decide` client

**Files:**
- Create: `src/client/log.mjs`, `src/client/jev-client.mjs`
- Create: `test/fixtures/questions/echo-area.mjs` (a tiny area module used only by tests)
- Test: `test/log.test.mjs`, `test/jev-client.test.mjs`

**Interfaces:**
- Consumes: `loadConfig`, `assertAllowedRoot`/`NotAllowedRoot`, `estimateTokens`, `buildRequest`, `validateAnswers`, `postSystemOne`, `recordingKey`/`readRecording`/`writeRecording`.
- Produces: `appendLog(logDir, area, entry): Promise<void>` writing `<logDir>/<area>.jsonl`.
- Produces: `decide(area, state, opts): Promise<Result>` with `opts = { cwd?, sessionId?, config?, fetchImpl?, loadArea?, now? }` and
  `Result = { ok: true, answers, meta: { latencyMs, model, truncated, mode, questionVersion } } | { ok: false, reason, detail? }`.
  `reason` is one of `disabled | not_allowed_root | no_api_key | no_recording | timeout | network | http_<status> | schema | area_load`.
- Area module contract (every file in `src/questions/`): `export const version: string`; `export const thresholds: object`; `export function buildQuestions(state): Questions`; `export function truncate(state): state`.
- `loadArea(area)` defaults to `import('../questions/<area>.mjs')`; tests pass their own loader.

- [ ] **Step 1: Write the failing tests**

`test/fixtures/questions/echo-area.mjs`:
```js
import { noul } from '../../../src/client/schema.mjs';
export const version = 'test-1';
export const thresholds = { deny: 0.8 };
export function buildQuestions(state) {
  return { yes: noul(`Is "${state.text}" affirmative?`) };
}
export function truncate(state) {
  return { ...state, text: state.text.slice(0, 10), truncatedBy: 'echo' };
}
```

`test/log.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendLog } from '../src/client/log.mjs';

test('appendLog creates the dir and appends one JSON line per call', async () => {
  const dir = join(await mkdtemp(join(tmpdir(), 'jevlog-')), 'nested');
  await appendLog(dir, 'area', { a: 1 });
  await appendLog(dir, 'area', { b: 2 });
  const lines = (await readFile(join(dir, 'area.jsonl'), 'utf8')).trim().split('\n');
  assert.deepEqual(lines.map((l) => JSON.parse(l)), [{ a: 1 }, { b: 2 }]);
});
```

`test/jev-client.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
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
  const line = JSON.parse((await readFile(join(config.logDir, 'echo.jsonl'), 'utf8')).trim());
  assert.equal(line.area, 'echo');
  assert.equal(line.sessionId, 's1');
  assert.equal(line.ok, true);
  assert.equal(typeof line.latencyMs, 'number');
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/log.test.mjs test/jev-client.test.mjs`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the implementations**

`src/client/log.mjs`:
```js
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function appendLog(logDir, area, entry) {
  await mkdir(logDir, { recursive: true });
  await appendFile(join(logDir, `${area}.jsonl`), `${JSON.stringify(entry)}\n`);
}
```

`src/client/jev-client.mjs`:
```js
import { loadConfig } from './config.mjs';
import { assertAllowedRoot, NotAllowedRoot } from './guard.mjs';
import { estimateTokens } from './tokens.mjs';
import { buildRequest, validateAnswers } from './schema.mjs';
import { postSystemOne } from './http.mjs';
import { recordingKey, readRecording, writeRecording } from './recorder.mjs';
import { appendLog } from './log.mjs';

const RETRYABLE_STATUS = (s) => s === 429 || s >= 500;

function defaultLoadArea(area) {
  return import(`../questions/${area}.mjs`);
}

async function callWithRetry({ config, body, fetchImpl }) {
  let lastFailure;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await postSystemOne({ url: config.baseUrl, apiKey: config.apiKey, body, timeoutMs: config.timeoutMs, fetchImpl });
      if (res.status >= 200 && res.status < 300) return { ok: true, body: res.body };
      lastFailure = { ok: false, reason: `http_${res.status}`, detail: res.text.slice(0, 500) };
      if (!RETRYABLE_STATUS(res.status)) return lastFailure;
    } catch (e) {
      lastFailure = { ok: false, reason: e.name === 'AbortError' ? 'timeout' : 'network', detail: e.message };
    }
  }
  return lastFailure;
}

async function obtainBody({ config, area, state, questions, fetchImpl }) {
  const key = recordingKey(state, questions);
  if (config.mode === 'replay') {
    const body = await readRecording(config.recordingsDir, area, key);
    return body ? { ok: true, body } : { ok: false, reason: 'no_recording', detail: key };
  }
  if (!config.apiKey) return { ok: false, reason: 'no_api_key' };
  const result = await callWithRetry({ config, body: buildRequest({ model: config.model, state, questions }), fetchImpl });
  if (result.ok && config.mode === 'record') await writeRecording(config.recordingsDir, area, key, result.body);
  return result;
}

/**
 * Ask Jev the area's questions about `state`. Never throws: every failure is `{ ok: false, reason }`
 * so hooks can fail open. Always logs one line.
 */
export async function decide(area, state, opts = {}) {
  const config = opts.config ?? loadConfig();
  const cwd = opts.cwd ?? process.cwd();
  const now = opts.now ?? (() => Date.now());
  const fetchImpl = opts.fetchImpl ?? fetch;
  const started = now();
  const base = { ts: new Date(started).toISOString(), area, sessionId: opts.sessionId ?? null, mode: config.mode, model: config.model };

  const finish = async (result, extra = {}) => {
    await appendLog(config.logDir, area, { ...base, ...extra, latencyMs: now() - started, ok: result.ok, reason: result.ok ? null : result.reason, answers: result.ok ? result.answers : null });
    return result;
  };

  if (config.disabled) return { ok: false, reason: 'disabled' };

  try {
    assertAllowedRoot(cwd, config.allowedRoots);
  } catch (e) {
    if (e instanceof NotAllowedRoot) return finish({ ok: false, reason: e.code, detail: cwd });
    throw e;
  }

  let mod;
  try {
    mod = await (opts.loadArea ?? defaultLoadArea)(area);
  } catch (e) {
    return finish({ ok: false, reason: 'area_load', detail: e.message });
  }

  let sentState = state;
  let truncated = false;
  if (estimateTokens(state) > config.maxStateTokens) {
    sentState = mod.truncate(state);
    truncated = true;
  }
  const questions = mod.buildQuestions(sentState);
  const extra = { questionVersion: mod.version, stateChars: JSON.stringify(sentState).length, estTokens: estimateTokens(sentState), truncated };

  const got = await obtainBody({ config, area, state: sentState, questions, fetchImpl });
  if (!got.ok) return finish(got, extra);

  const valid = validateAnswers(questions, got.body);
  if (!valid.ok) return finish({ ok: false, reason: 'schema', detail: valid.detail }, extra);

  return finish({
    ok: true,
    answers: valid.answers,
    meta: { latencyMs: now() - started, model: config.model, truncated, mode: config.mode, questionVersion: mod.version },
  }, extra);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/log.test.mjs test/jev-client.test.mjs`
Expected: 12 passing.

- [ ] **Step 5: Commit**

```bash
git add src/client/log.mjs src/client/jev-client.mjs test/log.test.mjs test/jev-client.test.mjs test/fixtures/questions/echo-area.mjs
git commit -m "feat: decide() client with guard, retry, record/replay, truncation, logging"
```

---

### Task 6: Hook I/O helpers

**Files:**
- Create: `src/hooks/io.mjs`
- Test: `test/hooks-io.test.mjs`

**Interfaces:**
- Produces: `readStdinJson(stream?): Promise<object>` (returns `{}` on empty or invalid input); `writeHookOutput(obj, out?): void` (writes `JSON.stringify(obj)` plus newline; writes nothing for `null`); `EXIT = { OK: 0, BLOCK: 2 }`.

- [ ] **Step 1: Write the failing test**

`test/hooks-io.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { readStdinJson, writeHookOutput, EXIT } from '../src/hooks/io.mjs';

test('readStdinJson parses a JSON document from a stream', async () => {
  const r = await readStdinJson(Readable.from([Buffer.from('{"a":'), Buffer.from('1}')]));
  assert.deepEqual(r, { a: 1 });
});

test('readStdinJson returns {} for empty or invalid input', async () => {
  assert.deepEqual(await readStdinJson(Readable.from([])), {});
  assert.deepEqual(await readStdinJson(Readable.from([Buffer.from('nope')])), {});
});

test('writeHookOutput writes one JSON line, or nothing for null', () => {
  let written = '';
  const out = new Writable({ write(chunk, enc, cb) { written += chunk; cb(); } });
  writeHookOutput({ x: 1 }, out);
  writeHookOutput(null, out);
  assert.equal(written, '{"x":1}\n');
});

test('EXIT codes', () => {
  assert.deepEqual(EXIT, { OK: 0, BLOCK: 2 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/hooks-io.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`src/hooks/io.mjs`:
```js
export const EXIT = Object.freeze({ OK: 0, BLOCK: 2 });

export async function readStdinJson(stream = process.stdin) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeHookOutput(obj, out = process.stdout) {
  if (obj === null || obj === undefined) return;
  out.write(`${JSON.stringify(obj)}\n`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/hooks-io.test.mjs`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/io.mjs test/hooks-io.test.mjs
git commit -m "feat: hook stdin/stdout helpers"
```

---

### Task 7: Comment-policy area module

**Files:**
- Create: `src/questions/comment-policy.mjs`
- Test: `test/questions-comment-policy.test.mjs`

**Interfaces:**
- Produces: `version = '1'`; `thresholds = { deny: 0.8, advise: 0.5 }`; `MAX_COMMENTS = 20`; `MAX_CODE_AFTER_CHARS = 200`; `buildQuestions(state)`; `truncate(state)`.
- State shape (consumed later by the adapter): `{ comments: [{ id: number, text: string, kind: 'line' | 'block' | 'kdoc', code_after: string }] }`. Question ids are `narrates_<i>`, `kind_<i>`, and for kdoc only `restates_signature_<i>`, where `<i>` is the index in `state.comments`.

- [ ] **Step 1: Write the failing test**

`test/questions-comment-policy.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as area from '../src/questions/comment-policy.mjs';

const state = { comments: [
  { id: 0, text: 'increment counter', kind: 'line', code_after: 'counter++' },
  { id: 1, text: 'Returns the user id\n@param id the id', kind: 'kdoc', code_after: 'fun userId(id: String): String' },
] };

test('exports the area contract', () => {
  assert.equal(area.version, '1');
  assert.deepEqual(area.thresholds, { deny: 0.8, advise: 0.5 });
  assert.equal(area.MAX_COMMENTS, 20);
});

test('builds narrates and kind for every comment, restates_signature for kdoc only', () => {
  const q = area.buildQuestions(state);
  assert.deepEqual(Object.keys(q).sort(), ['kind_0', 'kind_1', 'narrates_0', 'narrates_1', 'restates_signature_1']);
  assert.equal(q.narrates_0.type, 'noul');
  assert.ok(q.narrates_0.criteria.true.length > 20);
  assert.ok(q.narrates_0.criteria.false.length > 20);
  assert.match(q.narrates_0.instructions, /`comments\[0\]/);
  assert.equal(q.kind_0.type, 'choice');
  assert.deepEqual(Object.keys(q.kind_0.criteria), ['narration', 'reason', 'public_summary', 'todo', 'other']);
  assert.equal(q.kind_0.criteria.other, null);
});

test('truncate caps comment count and code_after length', () => {
  const many = { comments: Array.from({ length: 30 }, (_, i) => ({ id: i, text: 't', kind: 'line', code_after: 'x'.repeat(500) })) };
  const t = area.truncate(many);
  assert.equal(t.comments.length, 20);
  assert.equal(t.comments[0].code_after.length, 200);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/questions-comment-policy.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`src/questions/comment-policy.mjs`:
```js
import { noul, choice } from '../client/schema.mjs';

export const version = '1';
export const thresholds = Object.freeze({ deny: 0.8, advise: 0.5 });
export const MAX_COMMENTS = 20;
export const MAX_CODE_AFTER_CHARS = 200;
// tuned: not yet; initial values from spec 7.1. Re-tune only from bin/jev-accuracy output.

const NARRATES_TRUE = 'The comment describes the operation that `code_after` visibly performs, using the same nouns and verbs as the code, and adds no reason, constraint, warning, or context that the code itself does not show.';
const NARRATES_FALSE = 'The comment explains why the code exists or is shaped this way: a workaround, an ordering constraint, a platform quirk, a race, a deliberate deviation; or it is a one-line summary of what a public class, object, or interface is for.';
const SIGNATURE_TRUE = 'The KDoc only repeats parameter names, parameter types, or the return type that already appear in `code_after`, with no meaning beyond the signature.';
const SIGNATURE_FALSE = 'The KDoc states a purpose, a precondition, a side effect, or a return meaning that the signature alone does not convey.';

const KIND_CRITERIA = Object.freeze({
  narration: 'Restates what the following code does',
  reason: 'Explains why: workaround, constraint, quirk, race, deliberate deviation',
  public_summary: 'One-line summary of what a public type or function is for',
  todo: 'Marks future work or a known gap',
  other: null,
});

export function buildQuestions(state) {
  const questions = {};
  state.comments.forEach((c, i) => {
    const ref = `\`comments[${i}]\``;
    questions[`narrates_${i}`] = noul(
      `Does ${ref}.text merely narrate what ${ref}.code_after does?`,
      { true: NARRATES_TRUE, false: NARRATES_FALSE },
    );
    if (c.kind === 'kdoc') {
      questions[`restates_signature_${i}`] = noul(
        `Does ${ref}.text only restate the signature in ${ref}.code_after?`,
        { true: SIGNATURE_TRUE, false: SIGNATURE_FALSE },
      );
    }
    questions[`kind_${i}`] = choice(`What kind of comment is ${ref}.text?`, KIND_CRITERIA);
  });
  return questions;
}

export function truncate(state) {
  return {
    comments: state.comments.slice(0, MAX_COMMENTS).map((c) => ({ ...c, code_after: c.code_after.slice(0, MAX_CODE_AFTER_CHARS) })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/questions-comment-policy.test.mjs`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/questions/comment-policy.mjs test/questions-comment-policy.test.mjs
git commit -m "feat: comment-policy question set"
```

---

### Task 8: Kotlin comment extractor

**Files:**
- Create: `src/adapters/comment-policy/comments.mjs`
- Test: `test/comments.test.mjs`

**Interfaces:**
- Produces: `extractComments(source: string): Array<{ id: number, line: number, kind: 'line' | 'block' | 'kdoc', text: string, codeAfter: string }>`. `line` is 1-based line of the comment start. `text` has delimiters removed, leading `*` stripped per line, lines trimmed, joined with `\n`. `codeAfter` is up to 3 following non-blank lines that are not comments, joined with `\n`. Comments inside string, raw string, or char literals are ignored. Kotlin nested block comments are handled.

- [ ] **Step 1: Write the failing test**

`test/comments.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractComments } from '../src/adapters/comment-policy/comments.mjs';

test('line comment with following code', () => {
  const src = 'val a = 1\n// increment counter\ncounter++\n\nprintln(counter)\nreturn counter\nx()\n';
  const [c] = extractComments(src);
  assert.equal(c.id, 0);
  assert.equal(c.line, 2);
  assert.equal(c.kind, 'line');
  assert.equal(c.text, 'increment counter');
  assert.equal(c.codeAfter, 'counter++\nprintln(counter)\nreturn counter');
});

test('block and kdoc comments are classified and cleaned', () => {
  const src = '/**\n * Returns the id.\n * @param id the id\n */\nfun f(id: String) = id\n/* plain\n   block */\nval x = 1\n';
  const [k, b] = extractComments(src);
  assert.equal(k.kind, 'kdoc');
  assert.equal(k.text, 'Returns the id.\n@param id the id');
  assert.equal(k.codeAfter, 'fun f(id: String) = id');
  assert.equal(b.kind, 'block');
  assert.equal(b.text, 'plain\nblock');
  assert.equal(b.line, 6);
});

test('comment markers inside strings, raw strings, and chars are ignored', () => {
  const src = 'val u = "http://x // not a comment"\nval r = """\n// also not\n"""\nval c = \'/\'\n// real\nval y = 2\n';
  const cs = extractComments(src);
  assert.equal(cs.length, 1);
  assert.equal(cs[0].text, 'real');
});

test('nested block comments end at the matching close', () => {
  const src = '/* outer /* inner */ still outer */\nval z = 3\n';
  const [c] = extractComments(src);
  assert.equal(c.text, 'outer /* inner */ still outer');
  assert.equal(c.codeAfter, 'val z = 3');
});

test('codeAfter skips blank lines and other comments, and may be empty at EOF', () => {
  const src = '// first\n\n// second\nval a = 1\n// last\n';
  const cs = extractComments(src);
  assert.equal(cs[0].codeAfter, 'val a = 1');
  assert.equal(cs[2].codeAfter, '');
});

test('ids are sequential', () => {
  const cs = extractComments('// a\n// b\n// c\n');
  assert.deepEqual(cs.map((c) => c.id), [0, 1, 2]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/comments.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`src/adapters/comment-policy/comments.mjs`:
```js
const CODE_AFTER_LINES = 3;

/** `covered` holds every 0-based line index that lies inside any comment. */
function codeAfterFrom(lines, startLineIdx, covered) {
  const out = [];
  for (let i = startLineIdx; i < lines.length && out.length < CODE_AFTER_LINES; i += 1) {
    if (covered.has(i) || !lines[i].trim()) continue;
    out.push(lines[i].trim());
  }
  return out.join('\n');
}

function coveredLines(found) {
  const covered = new Set();
  for (const c of found) {
    for (let l = c.line; l <= c.endLine; l += 1) covered.add(l - 1);
  }
  return covered;
}

function cleanBlock(body) {
  return body
    .split('\n')
    .map((l) => l.trim().replace(/^\*+\s?/, '').trim())
    .filter((l, idx, arr) => !(l === '' && (idx === 0 || idx === arr.length - 1)))
    .join('\n')
    .trim();
}

/** Scans Kotlin source and returns every comment with the code that follows it. */
export function extractComments(source) {
  const lines = source.split('\n');
  const found = [];
  let i = 0;
  let line = 1;
  const n = source.length;

  const advance = (k = 1) => {
    for (let s = 0; s < k; s += 1) {
      if (source[i] === '\n') line += 1;
      i += 1;
    }
  };

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '"' && next === '"' && source[i + 2] === '"') {
      advance(3);
      while (i < n && !(source[i] === '"' && source[i + 1] === '"' && source[i + 2] === '"')) advance();
      advance(3);
      continue;
    }
    if (ch === '"') {
      advance();
      while (i < n && source[i] !== '"') advance(source[i] === '\\' ? 2 : 1);
      advance();
      continue;
    }
    if (ch === "'") {
      advance();
      while (i < n && source[i] !== "'") advance(source[i] === '\\' ? 2 : 1);
      advance();
      continue;
    }
    if (ch === '/' && next === '/') {
      const startLine = line;
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      const text = source.slice(i + 2, stop).trim();
      found.push({ line: startLine, kind: 'line', text, endLine: startLine });
      advance(stop - i);
      continue;
    }
    if (ch === '/' && next === '*') {
      const startLine = line;
      const kind = source[i + 2] === '*' && source[i + 3] !== '/' ? 'kdoc' : 'block';
      advance(2);
      let depth = 1;
      const bodyStart = i;
      while (i < n && depth > 0) {
        if (source[i] === '/' && source[i + 1] === '*') { depth += 1; advance(2); continue; }
        if (source[i] === '*' && source[i + 1] === '/') { depth -= 1; if (depth === 0) break; advance(2); continue; }
        advance();
      }
      const body = source.slice(bodyStart, i).replace(/^\*/, '');
      const endLine = line;
      advance(2);
      found.push({ line: startLine, kind, text: cleanBlock(body), endLine });
      continue;
    }
    advance();
  }

  const covered = coveredLines(found);
  return found.map((c, id) => ({
    id,
    line: c.line,
    kind: c.kind,
    text: c.text,
    codeAfter: codeAfterFrom(lines, c.endLine, covered),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/comments.test.mjs`
Expected: 6 passing. If the kdoc `text` test fails on a leading blank line, check `cleanBlock`'s first-and-last blank filter. If `codeAfter` includes a line that belongs to another comment (for example `block */`), check that `coveredLines` marks every line from `line` to `endLine` inclusive and that `codeAfterFrom` starts at index `endLine` (the 0-based index of the line after the comment).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/comment-policy/comments.mjs test/comments.test.mjs
git commit -m "feat: kotlin comment extractor"
```

---

### Task 9: Deterministic filters

**Files:**
- Create: `src/adapters/comment-policy/filters.mjs`
- Test: `test/filters.test.mjs`

**Interfaces:**
- Consumes: comment objects from `extractComments`.
- Produces: `RULES = { BANNER: 'banner', COMMENTED_OUT: 'commented_out_code', STEP: 'step_numbering', NARRATION: 'narration', RESTATES_SIGNATURE: 'restates_signature' }`; `applyFilters(comments): { deterministic: Array<{ comment, rule }>, remaining: comment[] }`. Comments containing `jev:allow`, or whose text starts with `TODO` or `FIXME`, are dropped from both lists.

- [ ] **Step 1: Write the failing test**

`test/filters.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters, RULES } from '../src/adapters/comment-policy/filters.mjs';

const c = (text, kind = 'line') => ({ id: 0, line: 1, kind, text, codeAfter: '' });

test('markers and TODO/FIXME are skipped entirely', () => {
  const r = applyFilters([c('does the thing jev:allow'), c('TODO: later'), c('FIXME broken')]);
  assert.deepEqual(r, { deterministic: [], remaining: [] });
});

test('banners are deterministic violations', () => {
  const r = applyFilters([c('==== HELPERS ===='), c('-----'), c('*****  section  *****')]);
  assert.equal(r.deterministic.length, 3);
  assert.ok(r.deterministic.every((d) => d.rule === RULES.BANNER));
});

test('commented-out code is detected by trailing brace/semicolon or leading keyword', () => {
  const r = applyFilters([c('val x = compute()'), c('if (a) {'), c('}'), c('foo();'), c('return result'), c('@Inject lateinit var x: Y'), c('override fun onStart() {')]);
  assert.equal(r.deterministic.length, 7);
  assert.ok(r.deterministic.every((d) => d.rule === RULES.COMMENTED_OUT));
});

test('step numbering is a deterministic violation', () => {
  const r = applyFilters([c('Step 1: load data'), c('1. parse'), c('2) map')]);
  assert.equal(r.deterministic.length, 3);
  assert.ok(r.deterministic.every((d) => d.rule === RULES.STEP));
});

test('ordinary prose goes to remaining', () => {
  const r = applyFilters([c('Retry once because the socket drops the first frame after resume'), c('increment counter')]);
  assert.equal(r.deterministic.length, 0);
  assert.equal(r.remaining.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/filters.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`src/adapters/comment-policy/filters.mjs`:
```js
export const RULES = Object.freeze({
  BANNER: 'banner',
  COMMENTED_OUT: 'commented_out_code',
  STEP: 'step_numbering',
  NARRATION: 'narration',
  RESTATES_SIGNATURE: 'restates_signature',
});

const ALLOW_MARKER = 'jev:allow';
const SKIP_PREFIX = /^(TODO|FIXME)\b/i;
const BANNER = /^[\s=\-*_#]*([=\-*_#])\1{2,}[\s=\-*_#A-Za-z]*$/;
const STEP = /^(step\s*\d+\s*[:.)-]|\d+\s*[.)]\s)/i;
const CODE_TAIL = /[{};]\s*$/;
const CODE_HEAD = /^(val|var|fun|return|if|when|for|while|import|package|class|object|private|public|internal|override|@\w+)\b/;

function isCommentedOutCode(text) {
  const first = text.split('\n')[0].trim();
  return CODE_TAIL.test(first) || CODE_HEAD.test(first);
}

function ruleFor(text) {
  if (BANNER.test(text)) return RULES.BANNER;
  if (STEP.test(text)) return RULES.STEP;
  if (isCommentedOutCode(text)) return RULES.COMMENTED_OUT;
  return null;
}

/** Splits comments into deterministic violations and those that need a judgment call. */
export function applyFilters(comments) {
  const deterministic = [];
  const remaining = [];
  for (const comment of comments) {
    const text = comment.text.trim();
    if (text.includes(ALLOW_MARKER) || SKIP_PREFIX.test(text)) continue;
    const rule = ruleFor(text);
    if (rule) deterministic.push({ comment, rule });
    else remaining.push(comment);
  }
  return { deterministic, remaining };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/filters.test.mjs`
Expected: 5 passing. If `'}'` alone fails the banner-vs-code ordering, confirm `BANNER` requires three repeated characters so a single brace does not match it.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/comment-policy/filters.mjs test/filters.test.mjs
git commit -m "feat: deterministic comment filters"
```

---

### Task 10: Decision and reason formatting

**Files:**
- Create: `src/adapters/comment-policy/decision.mjs`
- Test: `test/decision.test.mjs`

**Interfaces:**
- Consumes: `{ deterministic, remaining }` from `applyFilters`; `answers` from `decide` (or `null` when Jev failed); `thresholds` from the area module; `RULES`.
- Produces: `evaluate({ deterministic, remaining, answers, thresholds }): { level: 'allow' | 'advise' | 'deny', items: Array<{ line, text, rule, probability }> }` where `probability` is `1` for deterministic items. `formatReason(level, items): string`.
- Indexing rule: `remaining[i]` corresponds to `narrates_<i>` and `restates_signature_<i>`.

- [ ] **Step 1: Write the failing test**

`test/decision.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, formatReason } from '../src/adapters/comment-policy/decision.mjs';
import { RULES } from '../src/adapters/comment-policy/filters.mjs';

const thresholds = { deny: 0.8, advise: 0.5 };
const c = (line, text, kind = 'line') => ({ id: line, line, kind, text, codeAfter: '' });

test('deterministic violations alone produce deny', () => {
  const r = evaluate({ deterministic: [{ comment: c(3, '=== x ==='), rule: RULES.BANNER }], remaining: [], answers: null, thresholds });
  assert.equal(r.level, 'deny');
  assert.deepEqual(r.items, [{ line: 3, text: '=== x ===', rule: RULES.BANNER, probability: 1 }]);
});

test('narration at or above deny threshold denies; between advise and deny advises; below allows', () => {
  const remaining = [c(1, 'a'), c(2, 'b'), c(3, 'c')];
  const answers = { narrates_0: { noul: 0.85 }, narrates_1: { noul: 0.6 }, narrates_2: { noul: 0.2 }, kind_0: {}, kind_1: {}, kind_2: {} };
  const r = evaluate({ deterministic: [], remaining, answers, thresholds });
  assert.equal(r.level, 'deny');
  assert.deepEqual(r.items.map((i) => [i.line, i.rule, i.probability]), [[1, RULES.NARRATION, 0.85], [2, RULES.NARRATION, 0.6]]);
});

test('only mid-band items produce advise', () => {
  const r = evaluate({ deterministic: [], remaining: [c(1, 'a')], answers: { narrates_0: { noul: 0.55 } }, thresholds });
  assert.equal(r.level, 'advise');
});

test('kdoc restating the signature is its own rule', () => {
  const r = evaluate({ deterministic: [], remaining: [c(4, 'Returns id', 'kdoc')], answers: { narrates_0: { noul: 0.1 }, restates_signature_0: { noul: 0.9 } }, thresholds });
  assert.equal(r.level, 'deny');
  assert.equal(r.items[0].rule, RULES.RESTATES_SIGNATURE);
});

test('null answers with nothing deterministic allows', () => {
  const r = evaluate({ deterministic: [], remaining: [c(1, 'a')], answers: null, thresholds });
  assert.deepEqual(r, { level: 'allow', items: [] });
});

test('formatReason lists each item with line, rule, and the policy line', () => {
  const s = formatReason('deny', [{ line: 3, text: 'increment counter', rule: RULES.NARRATION, probability: 0.9 }]);
  assert.match(s, /line 3/);
  assert.match(s, /narration/);
  assert.match(s, /increment counter/);
  assert.match(s, /explain why, never what/);
  assert.match(s, /0\.90/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/decision.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`src/adapters/comment-policy/decision.mjs`:
```js
import { RULES } from './filters.mjs';

const POLICY = 'Policy: comments explain why, never what. Delete narration; keep or rewrite only comments that carry a reason the code cannot show.';

function jevItems(remaining, answers, thresholds) {
  if (!answers) return [];
  const items = [];
  remaining.forEach((comment, i) => {
    const checks = [
      [RULES.NARRATION, answers[`narrates_${i}`]?.noul],
      [RULES.RESTATES_SIGNATURE, answers[`restates_signature_${i}`]?.noul],
    ];
    for (const [rule, p] of checks) {
      if (typeof p === 'number' && p >= thresholds.advise) {
        items.push({ line: comment.line, text: comment.text, rule, probability: p });
      }
    }
  });
  return items;
}

/** Pure: combines deterministic violations with Jev answers into one level and an item list. */
export function evaluate({ deterministic, remaining, answers, thresholds }) {
  const items = [
    ...deterministic.map(({ comment, rule }) => ({ line: comment.line, text: comment.text, rule, probability: 1 })),
    ...jevItems(remaining, answers, thresholds),
  ].sort((a, b) => a.line - b.line);
  const max = items.reduce((m, it) => Math.max(m, it.probability), 0);
  const level = max >= thresholds.deny ? 'deny' : max >= thresholds.advise ? 'advise' : 'allow';
  return { level, items: level === 'allow' ? [] : items };
}

export function formatReason(level, items) {
  const head = level === 'deny' ? 'JEV comment policy: write denied.' : 'JEV comment policy: advisory.';
  const lines = items.map((it) => `- line ${it.line}: ${it.rule} (p=${it.probability.toFixed(2)}) "${it.text.split('\n')[0]}"`);
  return [head, ...lines, POLICY].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/decision.test.mjs`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/comment-policy/decision.mjs test/decision.test.mjs
git commit -m "feat: comment-policy decision and reason formatting"
```

---

### Task 11: Session state for the loop guard

**Files:**
- Create: `src/adapters/comment-policy/session-state.mjs`
- Test: `test/session-state.test.mjs`

**Interfaces:**
- Produces: `editHash(filePath: string, text: string): string` (sha256 hex); `bumpDenyCount(stateDir, sessionId, hash): Promise<number>` returning the count after increment, persisted at `<stateDir>/<sessionId>.json` as `{ [hash]: count }`. `MAX_DENIES = 2`.

- [ ] **Step 1: Write the failing test**

`test/session-state.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editHash, bumpDenyCount, MAX_DENIES } from '../src/adapters/comment-policy/session-state.mjs';

test('editHash is stable and sensitive to both inputs', () => {
  assert.equal(editHash('a.kt', 'x'), editHash('a.kt', 'x'));
  assert.notEqual(editHash('a.kt', 'x'), editHash('b.kt', 'x'));
  assert.notEqual(editHash('a.kt', 'x'), editHash('a.kt', 'y'));
});

test('bumpDenyCount increments per session and hash, isolated across sessions', async () => {
  const dir = join(await mkdtemp(join(tmpdir(), 'jevss-')), 'state');
  assert.equal(await bumpDenyCount(dir, 's1', 'h'), 1);
  assert.equal(await bumpDenyCount(dir, 's1', 'h'), 2);
  assert.equal(await bumpDenyCount(dir, 's1', 'other'), 1);
  assert.equal(await bumpDenyCount(dir, 's2', 'h'), 1);
  assert.equal(MAX_DENIES, 2);
});

test('sessionId is sanitised to a safe filename', async () => {
  const dir = join(await mkdtemp(join(tmpdir(), 'jevss-')), 'state');
  assert.equal(await bumpDenyCount(dir, '../evil/../x', 'h'), 1);
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(dir);
  assert.equal(files.length, 1);
  assert.doesNotMatch(files[0], /\//);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/session-state.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`src/adapters/comment-policy/session-state.mjs`:
```js
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const MAX_DENIES = 2;

export function editHash(filePath, text) {
  return createHash('sha256').update(filePath).update('\0').update(text).digest('hex');
}

function safeName(sessionId) {
  return String(sessionId || 'no-session').replace(/[^A-Za-z0-9_-]/g, '_');
}

async function readState(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}

/** Counts how many times the same edit has been denied in this session so the hook can stop looping. */
export async function bumpDenyCount(stateDir, sessionId, hash) {
  await mkdir(stateDir, { recursive: true });
  const path = join(stateDir, `${safeName(sessionId)}.json`);
  const state = await readState(path);
  const next = { ...state, [hash]: (state[hash] ?? 0) + 1 };
  await writeFile(path, JSON.stringify(next));
  return next[hash];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/session-state.test.mjs`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/comment-policy/session-state.mjs test/session-state.test.mjs
git commit -m "feat: per-session deny counter for the comment-policy loop guard"
```

---

### Task 12: Comment-policy hook

**Files:**
- Create: `src/adapters/comment-policy/hook.mjs`, `bin/jev-hook-comment-policy.mjs`, `examples/settings.comment-policy.json`
- Test: `test/comment-policy-hook.test.mjs`

**Interfaces:**
- Consumes: `readStdinJson`, `writeHookOutput`, `EXIT`; `loadConfig`; `decide`; `extractComments`; `applyFilters`; `evaluate`, `formatReason`; `editHash`, `bumpDenyCount`, `MAX_DENIES`; area `thresholds`, `MAX_COMMENTS`.
- Produces: `runCommentPolicy(input, { config, fetchImpl, decideImpl? }): Promise<{ output: object | null, exitCode: number }>` and a `main()` in the bin file that reads stdin, calls it, writes output, exits.
- Hook input (PreToolUse): `{ session_id, cwd, hook_event_name, tool_name, tool_input: { file_path, new_string?, content? } }`.
- Hook output: deny → `{ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason } }`; advise → `{ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', additionalContext } }`; allow → `null`. Exit code is always 0.

- [ ] **Step 1: Write the failing test**

`test/comment-policy-hook.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { runCommentPolicy } from '../src/adapters/comment-policy/hook.mjs';
import { DEFAULTS, toolkitRoot } from '../src/client/config.mjs';

async function cfg(overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'jevhook-'));
  return { ...DEFAULTS, logDir: join(dir, 'logs'), recordingsDir: join(dir, 'rec'), allowedRoots: ['/proj'], apiKey: 'K', disabled: false, configMissing: false, ...overrides };
}

const input = (text, extra = {}) => ({
  session_id: 'sess', cwd: '/proj', hook_event_name: 'PreToolUse', tool_name: 'Edit',
  tool_input: { file_path: '/proj/app/A.kt', new_string: text }, ...extra,
});

const fetchWith = (nouls) => async () => ({ status: 200, text: async () => JSON.stringify({ answers: Object.fromEntries(Object.entries(nouls).map(([k, v]) => [k, typeof v === 'number' ? { type: 'noul', noul: v } : { type: 'choice', choice: v, probabilities: {}, confidence: 0.9 }])) }) });

test('non-Kotlin files are allowed without any call', async () => {
  let called = false;
  const r = await runCommentPolicy(input('// x', { tool_input: { file_path: '/proj/a.ts', new_string: '// x' } }), { config: await cfg(), fetchImpl: async () => { called = true; } });
  assert.deepEqual(r, { output: null, exitCode: 0 });
  assert.equal(called, false);
});

test('no comments means allow without any call', async () => {
  let called = false;
  const r = await runCommentPolicy(input('val a = 1\n'), { config: await cfg(), fetchImpl: async () => { called = true; } });
  assert.deepEqual(r, { output: null, exitCode: 0 });
  assert.equal(called, false);
});

test('banner denies without calling Jev', async () => {
  let called = false;
  const r = await runCommentPolicy(input('// ===== HELPERS =====\nfun a() {}\n'), { config: await cfg(), fetchImpl: async () => { called = true; } });
  assert.equal(called, false);
  assert.equal(r.output.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(r.output.hookSpecificOutput.permissionDecisionReason, /banner/);
});

test('narration above deny threshold denies with reason', async () => {
  const r = await runCommentPolicy(input('// increment counter\ncounter++\n'), { config: await cfg(), fetchImpl: fetchWith({ narrates_0: 0.92, kind_0: 'narration' }) });
  assert.equal(r.output.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(r.output.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(r.output.hookSpecificOutput.permissionDecisionReason, /line 1.*narration/);
  assert.equal(r.exitCode, 0);
});

test('mid-band narration allows with additionalContext', async () => {
  const r = await runCommentPolicy(input('// bump it\ncounter++\n'), { config: await cfg(), fetchImpl: fetchWith({ narrates_0: 0.6, kind_0: 'narration' }) });
  assert.equal(r.output.hookSpecificOutput.permissionDecision, 'allow');
  assert.match(r.output.hookSpecificOutput.additionalContext, /advisory/);
});

test('reason comment allows silently', async () => {
  const r = await runCommentPolicy(input('// Retry once: the socket drops the first frame after resume\nretry()\n'), { config: await cfg(), fetchImpl: fetchWith({ narrates_0: 0.05, kind_0: 'reason' }) });
  assert.deepEqual(r, { output: null, exitCode: 0 });
});

test('Jev failure fails open: allow with no output', async () => {
  const r = await runCommentPolicy(input('// increment counter\ncounter++\n'), { config: await cfg(), fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  assert.deepEqual(r, { output: null, exitCode: 0 });
});

test('Write tool uses content instead of new_string', async () => {
  const r = await runCommentPolicy(input(null, { tool_name: 'Write', tool_input: { file_path: '/proj/B.kt', content: '// increment counter\ncounter++\n' } }), { config: await cfg(), fetchImpl: fetchWith({ narrates_0: 0.95, kind_0: 'narration' }) });
  assert.equal(r.output.hookSpecificOutput.permissionDecision, 'deny');
});

test('third identical denied edit is allowed with an advisory', async () => {
  const config = await cfg();
  const f = fetchWith({ narrates_0: 0.95, kind_0: 'narration' });
  const i = input('// increment counter\ncounter++\n');
  assert.equal((await runCommentPolicy(i, { config, fetchImpl: f })).output.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal((await runCommentPolicy(i, { config, fetchImpl: f })).output.hookSpecificOutput.permissionDecision, 'deny');
  const third = await runCommentPolicy(i, { config, fetchImpl: f });
  assert.equal(third.output.hookSpecificOutput.permissionDecision, 'allow');
  assert.match(third.output.hookSpecificOutput.additionalContext, /denied twice/);
});

test('more than 20 comments are sent in chunks', async () => {
  let calls = 0;
  const f = async (url, init) => {
    calls += 1;
    const n = Object.keys(JSON.parse(init.body).questions).filter((k) => k.startsWith('narrates_')).length;
    const answers = {};
    for (let i = 0; i < n; i += 1) { answers[`narrates_${i}`] = { noul: 0.1 }; answers[`kind_${i}`] = { choice: 'reason', probabilities: {}, confidence: 0.9 }; }
    return { status: 200, text: async () => JSON.stringify({ answers }) };
  };
  const src = Array.from({ length: 25 }, (_, i) => `// because of reason ${i}\nval v${i} = ${i}`).join('\n');
  const r = await runCommentPolicy(input(src), { config: await cfg(), fetchImpl: f });
  assert.equal(calls, 2);
  assert.equal(r.output, null);
});

test('bin entry: JEV_DISABLE=1 exits 0 with no output; banner denies over stdin', async () => {
  const run = (env, stdinText) => new Promise((resolve) => {
    const p = spawn(process.execPath, [join(toolkitRoot(), 'bin', 'jev-hook-comment-policy.mjs')], { env: { ...process.env, ...env } });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
    p.stdin.end(stdinText);
  });
  const dir = await mkdtemp(join(tmpdir(), 'jevbin-'));
  const cfgPath = join(dir, 'c.json');
  await writeFile(cfgPath, JSON.stringify({ allowedRoots: ['/proj'], logDir: join(dir, 'logs') }));
  const payload = JSON.stringify(input('// ===== X =====\nval a = 1\n'));
  const disabled = await run({ JEV_CONFIG: cfgPath, JEV_DISABLE: '1' }, payload);
  assert.equal(disabled.code, 0);
  assert.equal(disabled.out, '');
  const denied = await run({ JEV_CONFIG: cfgPath, JEV_DISABLE: '' }, payload);
  assert.equal(denied.code, 0);
  assert.equal(JSON.parse(denied.out).hookSpecificOutput.permissionDecision, 'deny');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/comment-policy-hook.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`src/adapters/comment-policy/hook.mjs`:
```js
import { join } from 'node:path';
import { loadConfig } from '../../client/config.mjs';
import { decide } from '../../client/jev-client.mjs';
import { extractComments } from './comments.mjs';
import { applyFilters } from './filters.mjs';
import { evaluate, formatReason } from './decision.mjs';
import { editHash, bumpDenyCount, MAX_DENIES } from './session-state.mjs';
import { thresholds, MAX_COMMENTS } from '../../questions/comment-policy.mjs';

const KOTLIN = /\.kts?$/;
const AREA = 'comment-policy';

const ALLOW = { output: null, exitCode: 0 };

function hookOutput(fields) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', ...fields } };
}

function textOf(input) {
  const t = input.tool_input ?? {};
  return input.tool_name === 'Write' ? t.content : t.new_string;
}

function toState(chunk) {
  return { comments: chunk.map((c, i) => ({ id: i, text: c.text, kind: c.kind, code_after: c.codeAfter })) };
}

async function askJev(remaining, ctx) {
  const merged = {};
  for (let start = 0; start < remaining.length; start += MAX_COMMENTS) {
    const chunk = remaining.slice(start, start + MAX_COMMENTS);
    const r = await ctx.decideImpl(AREA, toState(chunk), { cwd: ctx.cwd, sessionId: ctx.sessionId, config: ctx.config, fetchImpl: ctx.fetchImpl });
    if (!r.ok) return null;
    for (const [k, v] of Object.entries(r.answers)) {
      const m = k.match(/^(.*)_(\d+)$/);
      merged[`${m[1]}_${Number(m[2]) + start}`] = v;
    }
  }
  return merged;
}

/** Pure-ish entry used by the bin and by tests. Never throws; every failure is allow. */
export async function runCommentPolicy(input, { config = loadConfig(), fetchImpl = fetch, decideImpl = decide } = {}) {
  try {
    if (config.disabled) return ALLOW;
    const filePath = input.tool_input?.file_path ?? '';
    const text = textOf(input);
    if (!KOTLIN.test(filePath) || typeof text !== 'string' || !text) return ALLOW;

    const { deterministic, remaining } = applyFilters(extractComments(text));
    if (!deterministic.length && !remaining.length) return ALLOW;

    const ctx = { config, fetchImpl, decideImpl, cwd: input.cwd ?? process.cwd(), sessionId: input.session_id ?? null };
    const answers = remaining.length ? await askJev(remaining, ctx) : null;
    const { level, items } = evaluate({ deterministic, remaining, answers, thresholds });
    if (level === 'allow') return ALLOW;

    const reason = formatReason(level, items);
    if (level === 'advise') return { output: hookOutput({ permissionDecision: 'allow', additionalContext: reason }), exitCode: 0 };

    const count = await bumpDenyCount(join(config.logDir, 'state'), ctx.sessionId, editHash(filePath, text));
    if (count > MAX_DENIES) {
      return { output: hookOutput({ permissionDecision: 'allow', additionalContext: `${reason}\nThis edit was denied twice already; allowing to avoid a loop. Fix the comments in a follow-up.` }), exitCode: 0 };
    }
    return { output: hookOutput({ permissionDecision: 'deny', permissionDecisionReason: reason }), exitCode: 0 };
  } catch {
    return ALLOW;
  }
}
```

`bin/jev-hook-comment-policy.mjs`:
```js
#!/usr/bin/env node
import { readStdinJson, writeHookOutput, EXIT } from '../src/hooks/io.mjs';
import { runCommentPolicy } from '../src/adapters/comment-policy/hook.mjs';

const input = await readStdinJson();
const { output, exitCode } = await runCommentPolicy(input);
writeHookOutput(output);
process.exit(exitCode ?? EXIT.OK);
```

`examples/settings.comment-policy.json` (for a local dry run; the path is replaced by the install command in plan 2):
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node /ABSOLUTE/PATH/TO/jev-toolkit/bin/jev-hook-comment-policy.mjs",
            "timeout": 10,
            "statusMessage": "JEV comment policy"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/comment-policy-hook.test.mjs`
Expected: 11 passing. If the bin test's disabled case prints output, check that `loadConfig` reads `JEV_DISABLE` from the spawned env and that `runCommentPolicy` checks `config.disabled` before anything else.

- [ ] **Step 5: Make the bin executable and commit**

```bash
chmod +x bin/jev-hook-comment-policy.mjs
git add src/adapters/comment-policy/hook.mjs bin/jev-hook-comment-policy.mjs examples/settings.comment-policy.json test/comment-policy-hook.test.mjs
git commit -m "feat: comment-policy PreToolUse hook"
```

---

### Task 13: Smoke command

**Files:**
- Create: `src/client/smoke.mjs`, `bin/jev-smoke.mjs`
- Test: `test/smoke.test.mjs`

**Interfaces:**
- Produces: `buildSmokeRequest(model): { model, state, questions }`; `formatSmokeReport({ status, body, text, validation, latencyMs }): { ok: boolean, text: string }`. The bin prints the report and exits 0 on pass, 2 on fail. On fail the text contains a block starting `PASTE THIS BACK` with the status, raw body, and validation detail.

- [ ] **Step 1: Write the failing test**

`test/smoke.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSmokeRequest, formatSmokeReport } from '../src/client/smoke.mjs';
import { validateAnswers } from '../src/client/schema.mjs';

test('smoke request has one of each primitive and the pinned model', () => {
  const req = buildSmokeRequest('jev-1.13.0');
  assert.equal(req.model, 'jev-1.13.0');
  assert.equal(typeof req.state, 'string');
  const types = Object.values(req.questions).map((q) => q.type).sort();
  assert.deepEqual(types, ['choice', 'noul', 'score']);
});

test('report passes on a valid body and prints usage when present', () => {
  const req = buildSmokeRequest('m');
  const body = { answers: {
    is_blue: { type: 'noul', noul: 0.99 },
    color: { type: 'choice', choice: 'blue', probabilities: { blue: 0.9, red: 0.05, other: 0.05 }, confidence: 0.9 },
    certainty: { type: 'score', score: 1.9, probabilities: [0.02, 0.06, 0.92], confidence: 0.9 },
  }, usage: { input_tokens: 40 } };
  const r = formatSmokeReport({ status: 200, body, text: JSON.stringify(body), validation: validateAnswers(req.questions, body), latencyMs: 120 });
  assert.equal(r.ok, true);
  assert.match(r.text, /PASS/);
  assert.match(r.text, /input_tokens/);
  assert.match(r.text, /120 ms/);
});

test('report fails on schema mismatch with a paste-back block', () => {
  const req = buildSmokeRequest('m');
  const body = { answers: { is_blue: { noul: 3 } } };
  const r = formatSmokeReport({ status: 200, body, text: JSON.stringify(body), validation: validateAnswers(req.questions, body), latencyMs: 90 });
  assert.equal(r.ok, false);
  assert.match(r.text, /PASTE THIS BACK/);
  assert.match(r.text, /is_blue/);
});

test('report fails on non-2xx', () => {
  const req = buildSmokeRequest('m');
  const r = formatSmokeReport({ status: 401, body: null, text: 'unauthorized', validation: validateAnswers(req.questions, null), latencyMs: 50 });
  assert.equal(r.ok, false);
  assert.match(r.text, /401/);
  assert.match(r.text, /unauthorized/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/smoke.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementations**

`src/client/smoke.mjs`:
```js
import { noul, choice, score } from './schema.mjs';

export function buildSmokeRequest(model) {
  return {
    model,
    state: 'The sky is blue on a clear afternoon.',
    questions: {
      is_blue: noul('Is the sky described as blue?', { true: 'The text says the sky is blue', false: 'The text says another color or nothing about color' }),
      color: choice('Which color is the sky?', { blue: 'Blue', red: 'Red', other: null }),
      certainty: score('How certain is the statement?', ['Hedged or uncertain', 'Somewhat confident', 'Stated as plain fact']),
    },
  };
}

export function formatSmokeReport({ status, body, text, validation, latencyMs }) {
  const ok = status >= 200 && status < 300 && validation.ok;
  const lines = [`JEV smoke: ${ok ? 'PASS' : 'FAIL'}`, `status: ${status}`, `latency: ${latencyMs} ms`];
  if (body?.usage) lines.push(`usage: ${JSON.stringify(body.usage)}`);
  if (ok) {
    lines.push(`answers: ${JSON.stringify(body.answers)}`);
  } else {
    lines.push('', 'PASTE THIS BACK', '----------------', `status: ${status}`, `validation: ${validation.ok ? 'ok' : validation.detail}`, `raw body: ${text.slice(0, 2000)}`, '----------------');
  }
  return { ok, text: lines.join('\n') };
}
```

`bin/jev-smoke.mjs`:
```js
#!/usr/bin/env node
import { loadConfig } from '../src/client/config.mjs';
import { postSystemOne } from '../src/client/http.mjs';
import { validateAnswers } from '../src/client/schema.mjs';
import { buildSmokeRequest, formatSmokeReport } from '../src/client/smoke.mjs';

const config = loadConfig();
if (!config.apiKey) {
  console.error('TYPESAFE_API_KEY is not set.');
  process.exit(2);
}
const req = buildSmokeRequest(config.model);
const started = Date.now();
let res;
try {
  res = await postSystemOne({ url: config.baseUrl, apiKey: config.apiKey, body: req, timeoutMs: Math.max(config.timeoutMs, 10000) });
} catch (e) {
  console.log(`JEV smoke: FAIL\n\nPASTE THIS BACK\n----------------\nerror: ${e.name}: ${e.message}\n----------------`);
  process.exit(2);
}
const report = formatSmokeReport({ ...res, validation: validateAnswers(req.questions, res.body), latencyMs: Date.now() - started });
console.log(report.text);
process.exit(report.ok ? 0 : 2);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/smoke.test.mjs`
Expected: 4 passing. Also run `node bin/jev-smoke.mjs` with no key set and confirm it prints the key message and exits 2 (no network call is made).

- [ ] **Step 5: Commit**

```bash
chmod +x bin/jev-smoke.mjs
git add src/client/smoke.mjs bin/jev-smoke.mjs test/smoke.test.mjs
git commit -m "feat: live smoke command with paste-back report"
```

---

### Task 14: Fixtures and accuracy report

**Files:**
- Create: `fixtures/comment-policy/cases.jsonl`, `src/bench/accuracy.mjs`, `bin/jev-accuracy.mjs`
- Test: `test/accuracy.test.mjs`

**Interfaces:**
- Fixture line: `{ "state": { "comments": [ { "id": 0, "text", "kind", "code_after" } ] }, "expected": { "narrates_0": boolean, "kind_0": string, "restates_signature_0"?: boolean } }`. One comment per case.
- Produces: `compareCase(expected, answers): Array<{ id, expected, predicted, correct, confidence }>` where for noul `predicted = noul >= 0.5` and `confidence = max(noul, 1 - noul)`; for choice `predicted = choice`, `confidence = answer.confidence`.
- Produces: `summarize(rows): { agreement, byQuestion: { [prefix]: { n, precision, recall } }, buckets: Array<{ range, n, accuracy }> }` where `prefix` strips the trailing `_<i>` and buckets are `[0.5,0.6)`, `[0.6,0.7)`, `[0.7,0.8)`, `[0.8,0.9)`, `[0.9,1.0]`.
- Produces: `formatReport(area, summary, skipped): string`.
- Bin: `node bin/jev-accuracy.mjs --area comment-policy [--mode live|record|replay]` runs `decide` per case with `cwd` set to the first allowed root (or the toolkit root when `allowedRoots` is empty and `--mode replay`), prints the report, exits 0. Cases whose `decide` returned `ok: false` are listed under skipped with their reason.

- [ ] **Step 1: Write the fixture file**

`fixtures/comment-policy/cases.jsonl`, 40 lines. Each line is one JSON object; the table below is the content, one row per line, written as `{"state":{"comments":[{"id":0,"text":T,"kind":K,"code_after":C}]},"expected":E}`:

| # | K | T | C | E |
|---|---|---|---|---|
| 1 | line | increment counter | `counter++` | narrates true, kind narration |
| 2 | line | set the title | `binding.title.text = title` | narrates true, kind narration |
| 3 | line | loop through items | `for (item in items) {` | narrates true, kind narration |
| 4 | line | return result | `return result` | narrates true, kind narration |
| 5 | line | create the adapter | `val adapter = FrameAdapter()` | narrates true, kind narration |
| 6 | line | check if list is empty | `if (frames.isEmpty()) return` | narrates true, kind narration |
| 7 | line | call connect | `client.connect(url)` | narrates true, kind narration |
| 8 | line | initialize the view model | `val vm: InspectorViewModel by viewModels()` | narrates true, kind narration |
| 9 | line | update state | `_state.value = _state.value.copy(frames = frames)` | narrates true, kind narration |
| 10 | line | close the socket | `socket.close(1000, null)` | narrates true, kind narration |
| 11 | line | map dto to entity | `return dtos.map { it.toEntity() }` | narrates true, kind narration |
| 12 | line | launch coroutine | `viewModelScope.launch {` | narrates true, kind narration |
| 13 | line | collect the flow | `frames.collect { render(it) }` | narrates true, kind narration |
| 14 | line | parse json | `val obj = Json.decodeFromString<Frame>(text)` | narrates true, kind narration |
| 15 | line | show error toast | `Toast.makeText(ctx, msg, LENGTH_SHORT).show()` | narrates true, kind narration |
| 16 | line | Retry once: the server drops the first frame after a resume | `retry(times = 1) { connect() }` | narrates false, kind reason |
| 17 | line | Must run before setContent or the insets listener never fires | `WindowCompat.setDecorFitsSystemWindows(window, false)` | narrates false, kind reason |
| 18 | line | Scarlet reuses the OkHttp client, so a new one here would leak connections | `val client = sharedOkHttp` | narrates false, kind reason |
| 19 | line | Protobuf length prefix is big-endian on this server, unlike the docs | `val len = buf.getInt(0)` | narrates false, kind reason |
| 20 | line | Debounce: the accessibility service emits duplicate events within 50 ms | `.debounce(50)` | narrates false, kind reason |
| 21 | line | Keep on Main: the chart view is not thread safe | `withContext(Dispatchers.Main) { chart.update(points) }` | narrates false, kind reason |
| 22 | line | Ordering matters: register the listener before the first emit or it is lost | `bus.register(listener)` | narrates false, kind reason |
| 23 | line | Workaround for a Compose 1.7 bug where LazyColumn drops the last key on rotation | `key(frame.id, frame.ts) {` | narrates false, kind reason |
| 24 | line | Intentionally empty: the base class requires an override | `override fun onIdle() {}` | narrates false, kind reason |
| 25 | line | Cap at 500 frames: beyond that the list recomposition takes over 16 ms | `.takeLast(500)` | narrates false, kind reason |
| 26 | kdoc | Returns the frame id | `fun frameId(): String` | narrates true, restates true, kind narration |
| 27 | kdoc | @param url the url\n@return the client | `fun client(url: String): WsClient` | narrates true, restates true, kind narration |
| 28 | kdoc | Sets the value | `fun setValue(v: Int)` | narrates true, restates true, kind narration |
| 29 | kdoc | Gets the list of frames | `val frames: List<Frame>` | narrates true, restates true, kind narration |
| 30 | kdoc | Constructor | `constructor(ctx: Context)` | narrates true, restates true, kind narration |
| 31 | kdoc | Holds decoded WebSocket frames for one inspector session and exposes them as a cold flow. | `class FrameStore(` | narrates false, restates false, kind public_summary |
| 32 | kdoc | Decodes a protobuf envelope into a Frame; throws DecodeException on a bad length prefix. | `fun decode(bytes: ByteArray): Frame` | narrates false, restates false, kind public_summary |
| 33 | kdoc | Entry point for the inspector overlay; must be started from the foreground service. | `object InspectorOverlay {` | narrates false, restates false, kind public_summary |
| 34 | kdoc | Connection state as seen by the UI. Distinct from the socket state because reconnects are hidden. | `enum class UiConnectionState {` | narrates false, restates false, kind public_summary |
| 35 | kdoc | Formats a frame for the detail sheet; long payloads are truncated to keep composition cheap. | `fun format(frame: Frame): String` | narrates false, restates false, kind public_summary |
| 36 | block | increments the counter and returns it | `fun next(): Int { counter++; return counter }` | narrates true, kind narration |
| 37 | block | The reconnect backoff is capped at 30 s because the server closes idle sockets at 60 s. | `val backoff = minOf(base * 2.0.pow(attempt), 30_000.0)` | narrates false, kind reason |
| 38 | line | TODO handle the disconnect case | `disconnect()` | narrates false, kind todo |
| 39 | line | Legal: payload logging is disabled in release per data policy | `if (BuildConfig.DEBUG) log(payload)` | narrates false, kind reason |
| 40 | line | assign the id | `id = newId` | narrates true, kind narration |

Note: the fixture stores `code_after` and `text` exactly as in the table; `\n` inside T becomes a real newline escape in JSON. Case 38 is included so the accuracy report shows how Jev labels a TODO even though the hook filters TODOs before calling Jev.

- [ ] **Step 2: Write the failing test**

`test/accuracy.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compareCase, summarize, formatReport } from '../src/bench/accuracy.mjs';
import { toolkitRoot } from '../src/client/config.mjs';

test('fixture file has 40 well-formed cases', async () => {
  const lines = (await readFile(join(toolkitRoot(), 'fixtures', 'comment-policy', 'cases.jsonl'), 'utf8')).trim().split('\n');
  assert.equal(lines.length, 40);
  for (const l of lines) {
    const c = JSON.parse(l);
    assert.equal(c.state.comments.length, 1);
    assert.equal(typeof c.expected.narrates_0, 'boolean');
    assert.equal(typeof c.expected.kind_0, 'string');
    if (c.state.comments[0].kind === 'kdoc') assert.equal(typeof c.expected.restates_signature_0, 'boolean');
  }
});

test('compareCase handles noul and choice', () => {
  const rows = compareCase({ narrates_0: true, kind_0: 'narration' }, { narrates_0: { noul: 0.9 }, kind_0: { choice: 'reason', confidence: 0.7 } });
  assert.deepEqual(rows, [
    { id: 'narrates_0', expected: true, predicted: true, correct: true, confidence: 0.9 },
    { id: 'kind_0', expected: 'narration', predicted: 'reason', correct: false, confidence: 0.7 },
  ]);
  assert.equal(compareCase({ narrates_0: false }, { narrates_0: { noul: 0.3 } })[0].confidence, 0.7);
});

test('summarize computes agreement, per-question precision/recall, and buckets', () => {
  const rows = [
    { id: 'narrates_0', expected: true, predicted: true, correct: true, confidence: 0.95 },
    { id: 'narrates_0', expected: false, predicted: true, correct: false, confidence: 0.55 },
    { id: 'narrates_0', expected: true, predicted: false, correct: false, confidence: 0.65 },
    { id: 'narrates_0', expected: false, predicted: false, correct: true, confidence: 0.85 },
    { id: 'kind_0', expected: 'reason', predicted: 'reason', correct: true, confidence: 0.75 },
  ];
  const s = summarize(rows);
  assert.equal(s.agreement, 0.6);
  assert.equal(s.byQuestion.narrates.n, 4);
  assert.equal(s.byQuestion.narrates.precision, 0.5);
  assert.equal(s.byQuestion.narrates.recall, 0.5);
  assert.equal(s.byQuestion.kind.n, 1);
  const b = Object.fromEntries(s.buckets.map((x) => [x.range, x]));
  assert.equal(b['0.9-1.0'].accuracy, 1);
  assert.equal(b['0.5-0.6'].accuracy, 0);
  assert.equal(b['0.6-0.7'].n, 1);
});

test('formatReport mentions area, agreement, and skipped reasons', () => {
  const s = summarize([{ id: 'narrates_0', expected: true, predicted: true, correct: true, confidence: 0.9 }]);
  const t = formatReport('comment-policy', s, [{ index: 3, reason: 'no_recording' }]);
  assert.match(t, /comment-policy/);
  assert.match(t, /agreement: 100\.0%/);
  assert.match(t, /skipped 1/);
  assert.match(t, /no_recording/);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/accuracy.test.mjs`
Expected: FAIL on the fixture test if the file is not yet written correctly, and module not found for accuracy.

- [ ] **Step 4: Write the implementation**

`src/bench/accuracy.mjs`:
```js
const BUCKETS = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.0000001]];

export function compareCase(expected, answers) {
  return Object.entries(expected).map(([id, exp]) => {
    const a = answers[id] ?? {};
    if (typeof exp === 'boolean') {
      const p = a.noul ?? 0;
      return { id, expected: exp, predicted: p >= 0.5, correct: (p >= 0.5) === exp, confidence: Math.max(p, 1 - p) };
    }
    return { id, expected: exp, predicted: a.choice ?? null, correct: a.choice === exp, confidence: a.confidence ?? 0 };
  });
}

function prefixOf(id) {
  return id.replace(/_\d+$/, '');
}

function precisionRecall(rows) {
  const positives = rows.filter((r) => r.expected === true);
  const predictedPositive = rows.filter((r) => r.predicted === true);
  const tp = rows.filter((r) => r.expected === true && r.predicted === true).length;
  return {
    precision: predictedPositive.length ? tp / predictedPositive.length : null,
    recall: positives.length ? tp / positives.length : null,
  };
}

export function summarize(rows) {
  const agreement = rows.length ? rows.filter((r) => r.correct).length / rows.length : 0;
  const byQuestion = {};
  for (const r of rows) {
    const k = prefixOf(r.id);
    byQuestion[k] = byQuestion[k] ?? [];
    byQuestion[k].push(r);
  }
  const byQuestionOut = Object.fromEntries(Object.entries(byQuestion).map(([k, rs]) => {
    const isBool = rs.every((r) => typeof r.expected === 'boolean');
    return [k, { n: rs.length, accuracy: rs.filter((r) => r.correct).length / rs.length, ...(isBool ? precisionRecall(rs) : { precision: null, recall: null }) }];
  }));
  const buckets = BUCKETS.map(([lo, hi]) => {
    const rs = rows.filter((r) => r.confidence >= lo && r.confidence < hi);
    return { range: `${lo.toFixed(1)}-${Math.min(hi, 1).toFixed(1)}`, n: rs.length, accuracy: rs.length ? rs.filter((r) => r.correct).length / rs.length : null };
  });
  return { agreement, byQuestion: byQuestionOut, buckets };
}

const pct = (v) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);

export function formatReport(area, summary, skipped) {
  const lines = [`JEV accuracy: ${area}`, `agreement: ${pct(summary.agreement)}`, '', 'by question:'];
  for (const [k, v] of Object.entries(summary.byQuestion)) {
    lines.push(`  ${k}: n=${v.n} accuracy=${pct(v.accuracy)} precision=${pct(v.precision)} recall=${pct(v.recall)}`);
  }
  lines.push('', 'calibration by confidence:');
  for (const b of summary.buckets) lines.push(`  ${b.range}: n=${b.n} accuracy=${pct(b.accuracy)}`);
  lines.push('', `skipped ${skipped.length}${skipped.length ? ': ' + skipped.map((s) => `#${s.index} (${s.reason})`).join(', ') : ''}`);
  return lines.join('\n');
}
```

`bin/jev-accuracy.mjs`:
```js
#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, toolkitRoot } from '../src/client/config.mjs';
import { decide } from '../src/client/jev-client.mjs';
import { compareCase, summarize, formatReport } from '../src/bench/accuracy.mjs';

const { values } = parseArgs({ options: { area: { type: 'string' }, mode: { type: 'string' } } });
if (!values.area) {
  console.error('usage: jev-accuracy --area <area> [--mode live|record|replay]');
  process.exit(1);
}
const config = loadConfig({ env: { ...process.env, ...(values.mode ? { JEV_MODE: values.mode } : {}) } });
const cwd = config.allowedRoots[0] ?? toolkitRoot();
if (!config.allowedRoots.length) config.allowedRoots.push(toolkitRoot());

const lines = (await readFile(join(toolkitRoot(), 'fixtures', values.area, 'cases.jsonl'), 'utf8')).trim().split('\n');
const rows = [];
const skipped = [];
for (const [index, line] of lines.entries()) {
  const c = JSON.parse(line);
  const r = await decide(values.area, c.state, { cwd, config, sessionId: `accuracy-${values.area}` });
  if (!r.ok) { skipped.push({ index, reason: r.reason }); continue; }
  rows.push(...compareCase(c.expected, r.answers));
}
console.log(formatReport(values.area, summarize(rows), skipped));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/accuracy.test.mjs`
Expected: 4 passing. Then run `node bin/jev-accuracy.mjs --area comment-policy --mode replay` and confirm it prints a report with `skipped 40` and every reason `no_recording` (there are no recordings on this machine; that is the expected output here).

- [ ] **Step 6: Commit**

```bash
chmod +x bin/jev-accuracy.mjs
git add fixtures/comment-policy/cases.jsonl src/bench/accuracy.mjs bin/jev-accuracy.mjs test/accuracy.test.mjs
git commit -m "feat: comment-policy fixtures and accuracy report"
```

---

### Task 15: README and full-suite check

**Files:**
- Create: `README.md`
- Modify: `CLAUDE.md` (add the test command line if missing; it is already there, so verify only)

- [ ] **Step 1: Write README.md**

```markdown
# JEV Toolkit

Puts [Jev](https://typesafe.ai) decisions (Choice / Score / Noul) into Claude Code hooks and a
benchmark harness. Zero npm dependencies. Node 20+.

Design: `docs/superpowers/specs/2026-09-21-jev-toolkit-design.md`.
Plans: `docs/superpowers/plans/`.

## Status

Plan 1 done: client, smoke, comment-policy hook, fixtures, accuracy script.
Plan 2 (target install, dynamic context, hand-back, router) and plan 3 (benchmark runner,
reporter, runbook) follow.

## Setup on a device that has a TypeSafe key

    cp jev.config.example.json jev.config.json   # fill allowedRoots with your target project path
    export TYPESAFE_API_KEY=...
    node bin/jev-smoke.mjs                        # one live call; paste the block back if it fails
    node bin/jev-accuracy.mjs --area comment-policy --mode record   # records responses into fixtures/recordings

## Tests (no network, no key)

    node --test

## Dry-run the comment-policy hook

Copy `examples/settings.comment-policy.json` into `<target>/.claude/settings.json`, replace the
absolute path, add the target to `allowedRoots`, then edit a `.kt` file in a Claude Code session.
A narration comment such as `// increment counter` above `counter++` is denied with a reason.
`JEV_DISABLE=1` turns every hook into a no-op.

## Layout

    src/client      decide(area, state) – guard, timeout, retry, record/replay, log
    src/questions   one module per area: buildQuestions, truncate, thresholds, version
    src/adapters    hooks and CLIs, thin; pure decision logic in its own module
    src/bench       accuracy scoring (runner and reporter arrive in plan 3)
    fixtures        labeled cases and recorded responses
```

- [ ] **Step 2: Run the whole suite**

Run: `node --test`
Expected: all tests passing, zero failures. Count should be the sum of every task's tests (about 70).

- [ ] **Step 3: Confirm no dependencies were introduced**

Run: `test ! -d node_modules && node -e "const p=require('./package.json'); if(p.dependencies||p.devDependencies) process.exit(1)" && echo clean`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README for plan 1"
```

---

## Self-review against the spec

- **§5 layout:** every file listed for plan 1 exists in a task; `bin/jev-hook-comment-policy.mjs` is the hook entry (the spec's `src/adapters/comment-policy/hook.mjs` is the module it wraps).
- **§6 client:** guard (T2, T5), area module loading (T5), truncation flag (T5, T7), modes (T4, T5), timeout and single retry with fail-open reasons (T5), schema validation (T3, T5), JSONL log fields (T5). Spec's `questions` export is realised as `buildQuestions(state)` because comment-policy questions are per comment; the area contract is stated in T5 and used identically in T7.
- **§7.1 questions:** ids, criteria style, thresholds, 20-comment chunking (T7, T12).
- **§8.1 adapter:** Kotlin-only gate, extractor with string and nesting handling, deterministic filters and skip rules, deny and advise outputs, loop guard on the third attempt, fail open (T8 to T12). The advisory uses `additionalContext` on a PreToolUse allow; if a future Claude Code version ignores that field on PreToolUse, the advisory is simply silent, which is the safe direction.
- **§10.6 accuracy:** fixture format, agreement, per-question precision and recall, calibration buckets, 40 comment cases (T14).
- **§11 portability:** config example, env-only key, guard, smoke with paste-back block, no `npm install` (T1, T13, T15). The install command and runbook belong to plans 2 and 3.
- **§13 testing:** every listed suite for the client and comment policy is present; all tests use a fake `fetch` or replay and need no network.
- **Type consistency:** `decide` result shape, area contract, `RULES` names, hook output field names, and `compareCase` row shape are used identically across T5, T7, T9, T10, T12, T14.
