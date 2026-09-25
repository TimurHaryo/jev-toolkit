# JEV Toolkit Plan 3: Benchmark Harness and Runbook

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a fixed task set on the WebSocket Inspector through Claude Code headless, with and without Jev in the loop, against DeepSeek or Qwen through an Anthropic-compatible endpoint, and produce comparable result files, a markdown report, and a runbook that lets the personal device run it all without this conversation.

**Architecture:** `src/bench/` gains provider and pricing config, an LLM-judge module (spawns `claude -p`) so the comment-policy `llm` arm and the accuracy tool can compare Jev against a cheap LLM, a headless runner that parses `--output-format stream-json`, a target controller that resets to `jev-baseline` and installs an arm, a results writer, a quality extractor, and a reporter. Arms gain an `orchestratorNote` appended to CLAUDE.md so the hand-back arms can instruct the parent. Everything Jev-related is already built; this plan only measures it.

**Tech Stack:** Node 20+ ES modules, `node:child_process` for `claude` and `git`, `node:test`. No npm packages. Claude Code CLI 2.1.x on the running device.

**Spec:** `docs/superpowers/specs/2026-09-21-jev-toolkit-design.md` (sections 10, 11, 12; section 9 tasks). Plans 1 and 2 are merged on `main`.

## Global Constraints

- Never write under `<work checkout>/` or `<work checkout copy>/`. This plan writes only to `~/Project/JEV`; the WebSocket Inspector is touched only by the runner at benchmark time on the personal device, never during implementation here.
- No `npm install`; `package.json` keeps no dependencies. Tests never spawn the real `claude` or `git push`; they inject fakes or use temp git repos.
- Cost is always `tokens × price table` from config, never the headless `total_cost_usd` field (which assumes Anthropic prices). Unknown model → `cost_usd: null` plus a warning line.
- The runner refuses to touch a target unless: it is under `allowedRoots`, it is a git repo, the tag `jev-baseline` exists, and `--yes-reset` was passed (it discards uncommitted changes in the target).
- Every reset is followed by an arm install, and every install is verified (hooks set, CLAUDE.md variant, rules folder) before the session runs.
- Headless invocation: `claude -p "<prompt>" --output-format stream-json --verbose --model <mapped> --max-turns <n> --permission-mode acceptEdits --allowedTools "Read,Edit,Write,MultiEdit,Grep,Glob,Bash(git *),Bash(./gradlew *),Agent"` from the target directory, with the arm's environment.
- Provider environment per arm: `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN` (read from the env var named in config, never stored), `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `CLAUDE_CODE_SUBAGENT_MODEL`, `JEV_MODE=live`, `JEV_RUN_ID`, `JEV_LOG_DIR`. `logDir` must be outside the target repository.
- Result file schema is spec §10.3; the manifest records device, OS, Node, Claude Code version, provider, base URL host, model mapping, Jev model pin, question versions, toolkit commit, date.
- Subagents must run in the foreground for hand-back attribution; the runner's task prompts for subagent tasks say so.
- No WorkApp text in tasks, notes, or the runbook. Commit as `timurharyo00@gmail.com`, conventional prefixes, `node --test` from the toolkit root.

---

## Existing interfaces this plan consumes (as implemented on `main`)

- `src/client/config.mjs`: `DEFAULTS`, `toolkitRoot()`, `loadConfig({ env?, configPath? })` → `{ mode, model, baseUrl, timeoutMs, maxStateTokens, contextBudgetTokens, logDir, recordingsDir, allowedRoots, apiKey, disabled, configMissing, configInvalid }`. Unknown keys in `jev.config.json` are carried through by the `{ ...DEFAULTS, ...fromFile }` merge, so `providers` and `activeProvider` arrive on the config object untouched.
- `src/client/guard.mjs`: `isAllowedRoot(cwd, roots)`.
- `src/client/jev-client.mjs`: `decide(area, state, opts)`.
- `src/targets/frontmatter.mjs`: `parseFrontmatter(text)` → `{ meta, body }` where `meta` has `id`, `summary`, `paths`, `always` plus any other `key: value` scalars and `key:` lists.
- `src/targets/rules.mjs`: `loadRules(dir)`. `src/targets/claude-md.mjs`: `renderClaudeMd(variant, rules)`. `src/targets/install.mjs`: `renderHooks(hooks, toolkitPath)`, `installArm({ targetDir, armFile, rulesDir, toolkitPath })` → `{ written, removed }`, refuses unmanaged folders, malformed settings, missing target.
- `src/adapters/comment-policy/`: `comments.mjs` `extractComments(text)`, `filters.mjs` `applyFilters(comments)` and `RULES`, `decision.mjs` `evaluate({ deterministic, remaining, answers, thresholds })` and `formatReason(level, items)`, `session-state.mjs` `editHash`, `bumpDenyCount`, `MAX_DENIES`; `hook.mjs` `runCommentPolicy(input, opts)` with `opts.decideImpl(area, state, ctx)` injectable.
- `src/questions/comment-policy.mjs`: `thresholds`, `MAX_COMMENTS`, `buildQuestions(state)`.
- `src/bench/accuracy.mjs`: `compareCase(expected, answers)`, `summarize(rows)`, `formatReport(area, summary, skipped)`. `bin/jev-accuracy.mjs --area <a> --mode <m>`.
- Hooks write: `<logDir>/<area>.jsonl` (one line per Jev call), `<logDir>/state/dynamic-context/<session_id>.json` = `{ injected: [ids] }`, `<logDir>/handback/<tool_use_id>.card.md`.
- Arms: `targets/websocket-inspector/arms/*.json` = `{ claudeMd, rules, hooks }`. Bins: `jev-hook-comment-policy.mjs`, `jev-hook-dynamic-context.mjs`, `jev-hook-handback-pre.mjs`, `jev-hook-handback-post.mjs`.

## File structure

```
jev.config.example.json                  + providers, activeProvider, benchmark
src/bench/providers.mjs                  resolveProvider, armEnv
src/bench/pricing.mjs                    costFromUsage
src/bench/llm-judge.mjs                  judge (spawns claude -p), buildJudgePrompt, parseJudgeAnswers
src/adapters/comment-policy/llm-hook.mjs runCommentPolicyLlm (decideImpl backed by the judge)
bin/jev-hook-comment-policy-llm.mjs
src/bench/claude-run.mjs                 runClaude (spawn), parseStream, extractResult
src/bench/target.mjs                     assertTarget, resetTarget, verifyInstall
src/bench/tasks.mjs                      loadTasks
src/bench/results.mjs                    buildManifest, writeResult, readRun
src/bench/quality.mjs                    goldSectionsScore, handbackSignals, readFullDiffAfterAgent
src/bench/runner.mjs                     runBenchmark (orchestration, injectable spawn)
bin/jev-bench.mjs
src/bench/report.mjs                     summarizeRun, renderReport, compareRuns
bin/jev-report.mjs
src/bench/hooks-check.mjs                checkHooks
bin/jev-hooks-check.mjs
targets/websocket-inspector/arms/        + comment-policy-none, comment-policy-llm, handback-always; handback-jev gains orchestratorNote
targets/websocket-inspector/tasks/NN-slug.md   fifteen prompts with gold labels
labels/.gitkeep                          hand labels per run (ignored except .gitkeep)
RUNBOOK.md
test/*.test.mjs
```

---

### Task 1: Providers and pricing

**Files:**
- Modify: `jev.config.example.json`
- Create: `src/bench/providers.mjs`, `src/bench/pricing.mjs`
- Test: `test/providers.test.mjs`, `test/pricing.test.mjs`

**Interfaces:**
- Config additions (example file):
```json
{
  "activeProvider": "deepseek",
  "providers": {
    "deepseek": {
      "baseUrl": "https://api.deepseek.com/anthropic",
      "authTokenEnv": "DEEPSEEK_API_KEY",
      "models": { "opus": "deepseek-reasoner", "sonnet": "deepseek-chat", "haiku": "deepseek-chat", "subagent": "deepseek-chat" },
      "pricing": { "deepseek-chat": { "input": 0.27, "output": 1.10, "cache_read": 0.07, "cache_write": 0.27 },
                   "deepseek-reasoner": { "input": 0.55, "output": 2.19, "cache_read": 0.14, "cache_write": 0.55 } }
    },
    "anthropic": {
      "baseUrl": null,
      "authTokenEnv": "ANTHROPIC_API_KEY",
      "models": { "opus": "claude-opus-5", "sonnet": "claude-sonnet-5", "haiku": "claude-haiku-4-5-20251001", "subagent": "claude-sonnet-5" },
      "pricing": {}
    }
  },
  "benchmark": { "maxTurns": 30, "orchestratorTier": "opus", "jevInputPricePerMTok": 0.042 }
}
```
  Prices are USD per million tokens and are placeholders the runbook tells the operator to update from the provider's price page on the day of the run.
- `resolveProvider(config, name?)` → `{ name, baseUrl, authTokenEnv, models, pricing }`; throws `Error('provider <name> not configured')` when missing.
- `armEnv({ provider, env, runId, logDir, subagentTier? })` → plain object of the variables listed in Global Constraints; `ANTHROPIC_AUTH_TOKEN` is `env[provider.authTokenEnv]` and the function throws `Error('<authTokenEnv> is not set')` when absent; when `provider.baseUrl` is null the `ANTHROPIC_BASE_URL` key is omitted (native Anthropic). `CLAUDE_CODE_SUBAGENT_MODEL` is `provider.models[subagentTier ?? 'subagent']`.
- `costFromUsage(usage, model, pricing)` → `{ cost_usd: number | null, warning?: string }` where `usage = { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }` and the table entry has `input`, `output`, `cache_read`, `cache_write` per million tokens. Missing entry → `{ cost_usd: null, warning: 'no price for <model>' }`.
- `costFromModelUsage(modelUsage, pricing)` → sums `costFromUsage` over `modelUsage = { [model]: usage }`; returns `{ cost_usd, per_model: { [model]: cost | null }, warnings: [] }`, with `cost_usd` null if any model is unpriced.

- [ ] **Step 1: Write the failing tests**

`test/pricing.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costFromUsage, costFromModelUsage } from '../src/bench/pricing.mjs';

const pricing = { 'deepseek-chat': { input: 0.27, output: 1.10, cache_read: 0.07, cache_write: 0.27 } };
const usage = { input_tokens: 1_000_000, output_tokens: 500_000, cache_creation_input_tokens: 100_000, cache_read_input_tokens: 2_000_000 };

test('cost is tokens times per-million prices, summed by kind', () => {
  const r = costFromUsage(usage, 'deepseek-chat', pricing);
  assert.equal(r.cost_usd.toFixed(4), (0.27 + 0.55 + 0.027 + 0.14).toFixed(4));
  assert.equal(r.warning, undefined);
});

test('unknown model yields null with a warning, never a guess', () => {
  const r = costFromUsage(usage, 'mystery', pricing);
  assert.equal(r.cost_usd, null);
  assert.match(r.warning, /mystery/);
});

test('missing usage fields count as zero', () => {
  assert.equal(costFromUsage({ input_tokens: 1_000_000 }, 'deepseek-chat', pricing).cost_usd, 0.27);
});

test('per-model sum, null when any model is unpriced', () => {
  const ok = costFromModelUsage({ 'deepseek-chat': usage, 'deepseek-chat-2': usage }, { ...pricing, 'deepseek-chat-2': pricing['deepseek-chat'] });
  assert.equal(ok.cost_usd.toFixed(4), (2 * (0.27 + 0.55 + 0.027 + 0.14)).toFixed(4));
  assert.deepEqual(ok.warnings, []);
  const bad = costFromModelUsage({ 'deepseek-chat': usage, mystery: usage }, pricing);
  assert.equal(bad.cost_usd, null);
  assert.equal(bad.per_model.mystery, null);
  assert.equal(bad.warnings.length, 1);
});
```

`test/providers.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveProvider, armEnv } from '../src/bench/providers.mjs';
import { toolkitRoot } from '../src/client/config.mjs';

const config = { activeProvider: 'deepseek', providers: {
  deepseek: { baseUrl: 'https://api.deepseek.com/anthropic', authTokenEnv: 'DEEPSEEK_API_KEY', models: { opus: 'r1', sonnet: 'v3', haiku: 'v3', subagent: 'v3' }, pricing: {} },
  anthropic: { baseUrl: null, authTokenEnv: 'ANTHROPIC_API_KEY', models: { opus: 'o', sonnet: 's', haiku: 'h', subagent: 's' }, pricing: {} },
} };

test('resolveProvider picks the active provider by default and by name', () => {
  assert.equal(resolveProvider(config).name, 'deepseek');
  assert.equal(resolveProvider(config, 'anthropic').name, 'anthropic');
  assert.throws(() => resolveProvider(config, 'nope'), /not configured/);
  assert.throws(() => resolveProvider({}), /not configured/);
});

test('armEnv builds the full variable set and reads the token from the named env var', () => {
  const env = armEnv({ provider: resolveProvider(config), env: { DEEPSEEK_API_KEY: 'tok' }, runId: 'r1', logDir: '/logs' });
  assert.deepEqual(env, {
    ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic', ANTHROPIC_AUTH_TOKEN: 'tok',
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'r1', ANTHROPIC_DEFAULT_SONNET_MODEL: 'v3', ANTHROPIC_DEFAULT_HAIKU_MODEL: 'v3',
    CLAUDE_CODE_SUBAGENT_MODEL: 'v3', JEV_MODE: 'live', JEV_RUN_ID: 'r1', JEV_LOG_DIR: '/logs',
  });
});

test('armEnv omits the base URL for native Anthropic, honours subagentTier, and refuses a missing token', () => {
  const env = armEnv({ provider: resolveProvider(config, 'anthropic'), env: { ANTHROPIC_API_KEY: 'k' }, runId: 'r', logDir: '/l', subagentTier: 'haiku' });
  assert.equal('ANTHROPIC_BASE_URL' in env, false);
  assert.equal(env.CLAUDE_CODE_SUBAGENT_MODEL, 'h');
  assert.throws(() => armEnv({ provider: resolveProvider(config), env: {}, runId: 'r', logDir: '/l' }), /DEEPSEEK_API_KEY is not set/);
});

test('the example config parses and carries the new sections', async () => {
  const ex = JSON.parse(await readFile(join(toolkitRoot(), 'jev.config.example.json'), 'utf8'));
  assert.equal(ex.activeProvider, 'deepseek');
  assert.ok(ex.providers.deepseek.models.subagent);
  assert.equal(typeof ex.benchmark.maxTurns, 'number');
  assert.equal(typeof ex.benchmark.jevInputPricePerMTok, 'number');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/pricing.test.mjs test/providers.test.mjs`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the implementations**

Add the `activeProvider`, `providers`, and `benchmark` blocks from the Interfaces section to `jev.config.example.json` (keep the existing keys).

`src/bench/pricing.mjs`:
```js
const PER_M = 1_000_000;
const KINDS = [['input_tokens', 'input'], ['output_tokens', 'output'], ['cache_read_input_tokens', 'cache_read'], ['cache_creation_input_tokens', 'cache_write']];

/** USD for one model's usage from a per-million price table. Never guesses a missing price. */
export function costFromUsage(usage, model, pricing) {
  const price = pricing?.[model];
  if (!price) return { cost_usd: null, warning: `no price for ${model}` };
  const cost = KINDS.reduce((sum, [field, key]) => sum + ((usage?.[field] ?? 0) / PER_M) * (price[key] ?? 0), 0);
  return { cost_usd: cost };
}

export function costFromModelUsage(modelUsage, pricing) {
  const per_model = {};
  const warnings = [];
  let total = 0;
  let unpriced = false;
  for (const [model, usage] of Object.entries(modelUsage ?? {})) {
    const r = costFromUsage(usage, model, pricing);
    per_model[model] = r.cost_usd;
    if (r.cost_usd === null) { unpriced = true; warnings.push(r.warning); } else total += r.cost_usd;
  }
  return { cost_usd: unpriced ? null : total, per_model, warnings };
}
```

`src/bench/providers.mjs`:
```js
export function resolveProvider(config, name) {
  const key = name ?? config?.activeProvider;
  const p = config?.providers?.[key];
  if (!p) throw new Error(`provider ${key ?? '(none)'} not configured`);
  return { name: key, baseUrl: p.baseUrl ?? null, authTokenEnv: p.authTokenEnv, models: p.models, pricing: p.pricing ?? {} };
}

/** Environment for one headless run. The token is read from the env var the provider names; it is never stored. */
export function armEnv({ provider, env, runId, logDir, subagentTier }) {
  const token = env[provider.authTokenEnv];
  if (!token) throw new Error(`${provider.authTokenEnv} is not set`);
  const out = {
    ...(provider.baseUrl ? { ANTHROPIC_BASE_URL: provider.baseUrl } : {}),
    ANTHROPIC_AUTH_TOKEN: token,
    ANTHROPIC_DEFAULT_OPUS_MODEL: provider.models.opus,
    ANTHROPIC_DEFAULT_SONNET_MODEL: provider.models.sonnet,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: provider.models.haiku,
    CLAUDE_CODE_SUBAGENT_MODEL: provider.models[subagentTier ?? 'subagent'],
    JEV_MODE: 'live',
    JEV_RUN_ID: runId,
    JEV_LOG_DIR: logDir,
  };
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/pricing.test.mjs test/providers.test.mjs`
Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git add jev.config.example.json src/bench/providers.mjs src/bench/pricing.mjs test/pricing.test.mjs test/providers.test.mjs
git commit -m "feat: provider config, arm environment, and usage pricing"
```

---

### Task 2: LLM judge, the comment-policy `llm` hook, and `--judge llm` for accuracy

**Files:**
- Create: `src/bench/llm-judge.mjs`, `src/adapters/comment-policy/llm-hook.mjs`, `bin/jev-hook-comment-policy-llm.mjs`, `targets/websocket-inspector/arms/comment-policy-llm.json`, `targets/websocket-inspector/arms/comment-policy-none.json`
- Modify: `bin/jev-accuracy.mjs` (add `--judge jev|llm`, default `jev`), `src/adapters/comment-policy/hook.mjs` (no change needed; `decideImpl` is already injectable)
- Test: `test/llm-judge.test.mjs`, `test/comment-policy-llm-hook.test.mjs`

**Interfaces:**
- `buildJudgePrompt(state, questions)` → string: a system-style instruction plus the JSON of `state` and, per question id, its `type`, `instructions`, and `criteria`, ending with: "Reply with ONLY a JSON object. For each noul id give a number in [0,1]. For each choice id give {\"choice\": <option>, \"confidence\": <0..1>}. No prose."
- `parseJudgeAnswers(text, questions)` → `{ ok: true, answers }` in Jev's answer shape (`{ type:'noul', noul }` or `{ type:'choice', choice, probabilities: {}, confidence }`) or `{ ok: false, reason: 'judge_parse', detail }`. It extracts the first `{…}` JSON object from the text (models sometimes wrap in fences). Every question id must be present and valid (noul in [0,1]; choice in the criteria keys) or it fails.
- `judge({ state, questions, model, spawnImpl, env, timeoutMs = 60000 })` → `{ ok: true, answers, meta: { latencyMs, usage } }` or `{ ok: false, reason, detail }`. Runs `claude -p <prompt> --output-format json --model <model> --max-turns 1` with `spawnImpl` (default `node:child_process` `spawn`), reads stdout, parses the outer JSON, takes `.result` as the text and `.usage` as usage. Non-zero exit → reason `judge_exit_<code>`; timeout → `judge_timeout`.
- `makeJudgeDecide({ model, spawnImpl, env, loadArea })` → an async function with `decide`'s signature `(area, state, ctx)` that builds questions with the area module's `buildQuestions(state)` and returns the judge's result, so the comment-policy hook can use it unchanged as `decideImpl`. It also appends a JSONL line to `<ctx.config.logDir>/<area>-llm.jsonl` with `{ ts, area, ok, reason, latencyMs, usage, model }` best-effort.
- `runCommentPolicyLlm(input, opts)` = `runCommentPolicy(input, { ...opts, decideImpl: makeJudgeDecide({ model: opts.model ?? process.env.JEV_JUDGE_MODEL ?? process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? 'haiku', spawnImpl: opts.spawnImpl, env: opts.env ?? process.env }) })`.
- `bin/jev-accuracy.mjs --judge llm` uses `makeJudgeDecide` instead of `decide`; the report header says `judge: llm (<model>)` or `judge: jev`.
- Arms: `comment-policy-none.json` = `{ "claudeMd": "full", "rules": "jev", "hooks": {} }`; `comment-policy-llm.json` = same as `comment-policy-jev.json` but `bin: "jev-hook-comment-policy-llm.mjs"` and `statusMessage: "LLM comment policy"`.

- [ ] **Step 1: Write the failing tests**

`test/llm-judge.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { buildJudgePrompt, parseJudgeAnswers, judge, makeJudgeDecide } from '../src/bench/llm-judge.mjs';
import { noul, choice } from '../src/client/schema.mjs';

const questions = { narrates_0: noul('Narrates?', { true: 'yes', false: 'no' }), kind_0: choice('Kind?', { narration: 'a', reason: 'b', other: null }) };

function fakeSpawn({ stdout = '', code = 0, delayMs = 0 }) {
  return (cmd, args, opts) => {
    fakeSpawn.last = { cmd, args, opts };
    const p = new EventEmitter();
    p.stdout = new EventEmitter(); p.stderr = new EventEmitter();
    p.kill = () => { p.emit('close', null); };
    setTimeout(() => { if (stdout) p.stdout.emit('data', Buffer.from(stdout)); p.emit('close', code); }, delayMs);
    return p;
  };
}

test('prompt carries state, every question, and the JSON-only instruction', () => {
  const p = buildJudgePrompt({ comments: [{ text: 'increment counter' }] }, questions);
  assert.match(p, /increment counter/);
  assert.match(p, /narrates_0/);
  assert.match(p, /kind_0/);
  assert.match(p, /ONLY a JSON object/);
});

test('parseJudgeAnswers accepts fenced JSON and produces Jev-shaped answers', () => {
  const r = parseJudgeAnswers('Sure:\n```json\n{"narrates_0": 0.9, "kind_0": {"choice": "narration", "confidence": 0.8}}\n```', questions);
  assert.equal(r.ok, true);
  assert.deepEqual(r.answers.narrates_0, { type: 'noul', noul: 0.9 });
  assert.deepEqual(r.answers.kind_0, { type: 'choice', choice: 'narration', probabilities: {}, confidence: 0.8 });
});

test('parseJudgeAnswers rejects missing ids, out-of-range nouls, and unknown choices', () => {
  assert.equal(parseJudgeAnswers('{"narrates_0": 0.9}', questions).ok, false);
  assert.equal(parseJudgeAnswers('{"narrates_0": 2, "kind_0": {"choice": "narration", "confidence": 1}}', questions).ok, false);
  assert.equal(parseJudgeAnswers('{"narrates_0": 0.5, "kind_0": {"choice": "nope", "confidence": 1}}', questions).ok, false);
  assert.equal(parseJudgeAnswers('no json here', questions).reason, 'judge_parse');
});

test('judge spawns claude -p with the model and returns answers plus usage', async () => {
  const out = JSON.stringify({ result: '{"narrates_0": 0.85, "kind_0": {"choice": "narration", "confidence": 0.7}}', usage: { input_tokens: 120, output_tokens: 30 } });
  const r = await judge({ state: { comments: [] }, questions, model: 'v3', spawnImpl: fakeSpawn({ stdout: out }), env: { X: '1' } });
  assert.equal(r.ok, true);
  assert.equal(r.answers.narrates_0.noul, 0.85);
  assert.deepEqual(r.meta.usage, { input_tokens: 120, output_tokens: 30 });
  assert.equal(fakeSpawn.last.cmd, 'claude');
  assert.ok(fakeSpawn.last.args.includes('--model') && fakeSpawn.last.args.includes('v3'));
  assert.ok(fakeSpawn.last.args.includes('--output-format') && fakeSpawn.last.args.includes('json'));
  assert.equal(fakeSpawn.last.opts.env.X, '1');
});

test('judge reports exit code, timeout, and unparsable output', async () => {
  assert.equal((await judge({ state: {}, questions, model: 'm', spawnImpl: fakeSpawn({ stdout: '', code: 2 }) })).reason, 'judge_exit_2');
  assert.equal((await judge({ state: {}, questions, model: 'm', spawnImpl: fakeSpawn({ stdout: 'x', delayMs: 200 }), timeoutMs: 20 })).reason, 'judge_timeout');
  assert.equal((await judge({ state: {}, questions, model: 'm', spawnImpl: fakeSpawn({ stdout: '{"result": "nope"}' }) })).reason, 'judge_parse');
});

test('makeJudgeDecide has decide()\'s signature and builds questions from the area module', async () => {
  const out = JSON.stringify({ result: '{"yes": 0.7}', usage: {} });
  const d = makeJudgeDecide({ model: 'm', spawnImpl: fakeSpawn({ stdout: out }), env: {}, loadArea: () => import('./fixtures/questions/echo-area.mjs') });
  const { mkdtemp } = await import('node:fs/promises'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'jevjudge-'));
  const r = await d('echo', { text: 'yes' }, { config: { logDir: dir } });
  assert.equal(r.ok, true);
  assert.equal(r.answers.yes.noul, 0.7);
});
```

`test/comment-policy-llm-hook.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommentPolicyLlm } from '../src/adapters/comment-policy/llm-hook.mjs';
import { DEFAULTS } from '../src/client/config.mjs';

function fakeSpawn(resultText) {
  return () => {
    const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => {};
    setTimeout(() => { p.stdout.emit('data', Buffer.from(JSON.stringify({ result: resultText, usage: { input_tokens: 10, output_tokens: 5 } }))); p.emit('close', 0); }, 0);
    return p;
  };
}
async function cfg() {
  const dir = await mkdtemp(join(tmpdir(), 'jevllm-'));
  return { ...DEFAULTS, logDir: join(dir, 'logs'), recordingsDir: join(dir, 'rec'), allowedRoots: ['/proj'], apiKey: undefined, disabled: false, configMissing: false, configInvalid: false };
}
const input = (text) => ({ session_id: 's', cwd: '/proj', hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: '/proj/A.kt', new_string: text } });

test('the llm hook denies narration using the judge instead of Jev, with no API key needed', async () => {
  const r = await runCommentPolicyLlm(input('// increment counter\ncounter++\n'), { config: await cfg(), model: 'v3', spawnImpl: fakeSpawn('{"narrates_0": 0.95, "kind_0": {"choice": "narration", "confidence": 0.9}}'), env: {} });
  assert.equal(r.output.hookSpecificOutput.permissionDecision, 'deny');
});

test('judge failure fails open', async () => {
  const r = await runCommentPolicyLlm(input('// increment counter\ncounter++\n'), { config: await cfg(), model: 'v3', spawnImpl: fakeSpawn('not json'), env: {} });
  assert.deepEqual(r, { output: null, exitCode: 0 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/llm-judge.test.mjs test/comment-policy-llm-hook.test.mjs`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the implementations**

`src/bench/llm-judge.mjs`:
```js
import { spawn as nodeSpawn } from 'node:child_process';
import { appendLog } from '../client/log.mjs';

const TAIL = 'Reply with ONLY a JSON object. For each noul id give a number in [0,1]. For each choice id give {"choice": <option>, "confidence": <0..1>}. No prose.';

export function buildJudgePrompt(state, questions) {
  const qs = Object.entries(questions).map(([id, q]) => `- ${id} (${q.type}): ${q.instructions}\n  criteria: ${JSON.stringify(q.criteria ?? null)}`).join('\n');
  return `You are a strict classifier. Evaluate the questions against the state.\n\nSTATE:\n${JSON.stringify(state)}\n\nQUESTIONS:\n${qs}\n\n${TAIL}`;
}

function firstJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  for (let end = text.length; end > start; end -= 1) {
    if (text[end - 1] !== '}') continue;
    try { return JSON.parse(text.slice(start, end)); } catch { /* keep shrinking */ }
  }
  return null;
}

const inUnit = (v) => typeof v === 'number' && v >= 0 && v <= 1;

export function parseJudgeAnswers(text, questions) {
  const obj = firstJsonObject(String(text ?? ''));
  if (!obj) return { ok: false, reason: 'judge_parse', detail: 'no JSON object in judge output' };
  const answers = {};
  for (const [id, q] of Object.entries(questions)) {
    const v = obj[id];
    if (q.type === 'noul') {
      if (!inUnit(v)) return { ok: false, reason: 'judge_parse', detail: `${id}: expected a number in [0,1]` };
      answers[id] = { type: 'noul', noul: v };
    } else if (q.type === 'choice') {
      if (!v || typeof v !== 'object' || !Object.prototype.hasOwnProperty.call(q.criteria, v.choice)) return { ok: false, reason: 'judge_parse', detail: `${id}: bad choice` };
      answers[id] = { type: 'choice', choice: v.choice, probabilities: {}, confidence: inUnit(v.confidence) ? v.confidence : 0.5 };
    } else {
      return { ok: false, reason: 'judge_parse', detail: `${id}: unsupported type ${q.type}` };
    }
  }
  return { ok: true, answers };
}

function runClaudeJson({ prompt, model, spawnImpl, env, timeoutMs }) {
  return new Promise((resolve) => {
    const args = ['-p', prompt, '--output-format', 'json', '--model', model, '--max-turns', '1'];
    const child = spawnImpl('claude', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; child.kill(); resolve({ ok: false, reason: 'judge_timeout' }); } }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', (e) => { if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, reason: 'judge_spawn', detail: e.message }); } });
    child.on('close', (code) => {
      if (done) return;
      done = true; clearTimeout(timer);
      if (code !== 0) return resolve({ ok: false, reason: `judge_exit_${code}`, detail: out.slice(0, 500) });
      try { resolve({ ok: true, body: JSON.parse(out) }); } catch { resolve({ ok: false, reason: 'judge_parse', detail: 'claude output is not JSON' }); }
    });
  });
}

/** Asks a Claude Code headless session to answer Jev-style questions; used only for the LLM arms. */
export async function judge({ state, questions, model, spawnImpl = nodeSpawn, env = process.env, timeoutMs = 60000 }) {
  const started = Date.now();
  const r = await runClaudeJson({ prompt: buildJudgePrompt(state, questions), model, spawnImpl, env, timeoutMs });
  if (!r.ok) return r;
  const parsed = parseJudgeAnswers(r.body?.result ?? '', questions);
  if (!parsed.ok) return parsed;
  return { ok: true, answers: parsed.answers, meta: { latencyMs: Date.now() - started, usage: r.body?.usage ?? {} } };
}

/** A drop-in for decide(): same signature, answers come from the LLM judge instead of Jev. */
export function makeJudgeDecide({ model, spawnImpl, env, loadArea = (area) => import(`../questions/${area}.mjs`) }) {
  return async (area, state, ctx = {}) => {
    const started = Date.now();
    let result;
    try {
      const mod = await loadArea(area);
      result = await judge({ state, questions: mod.buildQuestions(state), model, spawnImpl, env });
    } catch (e) {
      result = { ok: false, reason: 'internal', detail: e?.message };
    }
    try {
      if (ctx.config?.logDir) await appendLog(ctx.config.logDir, `${area}-llm`, { ts: new Date(started).toISOString(), area, model, ok: result.ok, reason: result.ok ? null : result.reason, latencyMs: Date.now() - started, usage: result.meta?.usage ?? null });
    } catch { /* best-effort */ }
    return result;
  };
}
```

`src/adapters/comment-policy/llm-hook.mjs`:
```js
import { runCommentPolicy } from './hook.mjs';
import { makeJudgeDecide } from '../../bench/llm-judge.mjs';

/** The comment-policy hook with an LLM judge in place of Jev; the benchmark's `llm` arm. */
export function runCommentPolicyLlm(input, opts = {}) {
  const env = opts.env ?? process.env;
  const model = opts.model ?? env.JEV_JUDGE_MODEL ?? env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? 'haiku';
  return runCommentPolicy(input, { ...opts, decideImpl: makeJudgeDecide({ model, spawnImpl: opts.spawnImpl, env }) });
}
```

`bin/jev-hook-comment-policy-llm.mjs`: the four-line hook bin shape importing `runCommentPolicyLlm`.

`bin/jev-accuracy.mjs`: add `judge: { type: 'string', default: 'jev' }` to `parseArgs`; reject values other than `jev`/`llm`; when `llm`, `const decideImpl = makeJudgeDecide({ model: process.env.JEV_JUDGE_MODEL ?? process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? 'haiku' })` and call it instead of `decide`; print a first line `judge: llm (<model>)` or `judge: jev` before the report.

Arm files as specified in Interfaces.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/llm-judge.test.mjs test/comment-policy-llm-hook.test.mjs test/install.test.mjs`
Expected: 8 new passing plus the install suite still green (the shipped-arm validation must accept the two new arm files).

- [ ] **Step 5: Commit**

```bash
chmod +x bin/jev-hook-comment-policy-llm.mjs
git add src/bench/llm-judge.mjs src/adapters/comment-policy/llm-hook.mjs bin/jev-hook-comment-policy-llm.mjs bin/jev-accuracy.mjs targets/websocket-inspector/arms/comment-policy-llm.json targets/websocket-inspector/arms/comment-policy-none.json test/llm-judge.test.mjs test/comment-policy-llm-hook.test.mjs
git commit -m "feat: LLM judge, comment-policy llm arm, and --judge llm for accuracy"
```

---

### Task 3: Orchestrator notes in arms, hand-back arms, and install verification

**Files:**
- Modify: `src/targets/claude-md.mjs` (`renderClaudeMd(variant, rules, note?)`), `src/targets/install.mjs` (pass `arm.orchestratorNote`; export `verifyInstall`)
- Modify: `targets/websocket-inspector/arms/handback-jev.json` (add note); Create: `targets/websocket-inspector/arms/handback-always.json`
- Test: `test/claude-md.test.mjs` (add one test), `test/install.test.mjs` (add two tests)

**Interfaces:**
- `renderClaudeMd(variant, rules, note)`: when `note` is a non-empty string, append `\n## Orchestrator note (benchmark arm)\n\n<note>\n` after the variant's content.
- Arm JSON gains optional `orchestratorNote: string`.
- `handback-always.json`: `{ "claudeMd": "full", "rules": "jev", "hooks": {}, "orchestratorNote": "After every Agent call returns, run `git diff` and read the full diff before deciding anything. Dispatch subagents in the foreground; never use background dispatch." }`
- `handback-jev.json` adds `"orchestratorNote": "After every Agent call returns you receive a 'JEV hand-back check' card. If its Flags line is not 'none', run `git diff` and read the full diff; otherwise rely on the card's Facts line and do not read the diff. Dispatch subagents in the foreground; never use background dispatch."`
- `verifyInstall({ targetDir, armFile, rulesDir, toolkitPath })` → `{ ok: true }` or `{ ok: false, problems: string[] }`. Checks: `CLAUDE.md` exists and equals `renderClaudeMd(arm.claudeMd, rules, arm.orchestratorNote)`; `.claude/settings.json` parses and its `hooks` deep-equals `renderHooks(arm.hooks ?? {}, toolkitPath)`; for `rules: "jev"` every non-core rule file exists under `.claude/jev-rules/` with the marker; for `native` every non-core rule with paths exists under `.claude/rules/` with the marker and `.claude/jev-rules` is absent; for `none` neither managed folder exists.

- [ ] **Step 1: Write the failing tests**

Append to `test/claude-md.test.mjs`:
```js
test('an orchestrator note is appended under its own heading, for every variant', () => {
  for (const v of ['full', 'stub', 'native']) {
    const out = renderClaudeMd(v, rules, 'Read the card first.');
    assert.match(out, /\n## Orchestrator note \(benchmark arm\)\n\nRead the card first\.\n$/);
  }
  assert.doesNotMatch(renderClaudeMd('full', rules, ''), /Orchestrator note/);
  assert.doesNotMatch(renderClaudeMd('full', rules), /Orchestrator note/);
});
```

Append to `test/install.test.mjs` (reuse its `RULES`, `ARMS`, imports; add `verifyInstall` to the import and `writeFile`, `rm` from `node:fs/promises` if missing):
```js
test('handback arms carry an orchestrator note that lands in CLAUDE.md', async () => {
  const target = await mkdtemp(join(tmpdir(), 'jevtarget-'));
  await installArm({ targetDir: target, armFile: join(ARMS, 'handback-jev.json'), rulesDir: RULES, toolkitPath: '/tk' });
  const claude = await readFile(join(target, 'CLAUDE.md'), 'utf8');
  assert.match(claude, /## Orchestrator note \(benchmark arm\)/);
  assert.match(claude, /JEV hand-back check/);
  await installArm({ targetDir: target, armFile: join(ARMS, 'handback-always.json'), rulesDir: RULES, toolkitPath: '/tk' });
  assert.match(await readFile(join(target, 'CLAUDE.md'), 'utf8'), /read the full diff before deciding/);
});

test('verifyInstall passes after install and reports each drift', async () => {
  const target = await mkdtemp(join(tmpdir(), 'jevtarget-'));
  const args = { targetDir: target, armFile: join(ARMS, 'all-jev.json'), rulesDir: RULES, toolkitPath: '/tk' };
  await installArm(args);
  assert.deepEqual(await verifyInstall(args), { ok: true });
  await writeFile(join(target, 'CLAUDE.md'), 'tampered');
  const settings = JSON.parse(await readFile(join(target, '.claude', 'settings.json'), 'utf8'));
  await writeFile(join(target, '.claude', 'settings.json'), JSON.stringify({ ...settings, hooks: {} }));
  await rm(join(target, '.claude', 'jev-rules', '02-compose.md'));
  const r = await verifyInstall(args);
  assert.equal(r.ok, false);
  assert.equal(r.problems.length, 3);
  assert.ok(r.problems.some((p) => /CLAUDE\.md/.test(p)));
  assert.ok(r.problems.some((p) => /hooks/.test(p)));
  assert.ok(r.problems.some((p) => /02-compose\.md/.test(p)));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/claude-md.test.mjs test/install.test.mjs`
Expected: the three new tests FAIL (note ignored; `verifyInstall` not exported).

- [ ] **Step 3: Write the implementations**

`src/targets/claude-md.mjs`: change the signature to `renderClaudeMd(variant, rules, note)`; compute the variant text as today into `base`, then `return note ? `${base}\n## Orchestrator note (benchmark arm)\n\n${note.trim()}\n` : base;`.

`src/targets/install.mjs`: in `installArm`, call `renderClaudeMd(arm.claudeMd, rules, arm.orchestratorNote)`. Add:
```js
async function readOr(path) {
  try { return await readFile(path, 'utf8'); } catch { return null; }
}

/** Re-reads a target and reports every way it differs from the arm; the runner refuses to run on drift. */
export async function verifyInstall({ targetDir, armFile, rulesDir, toolkitPath }) {
  const arm = JSON.parse(await readFile(armFile, 'utf8'));
  const rules = await loadRules(rulesDir);
  const problems = [];
  const claudeDir = join(targetDir, '.claude');

  const claude = await readOr(join(targetDir, 'CLAUDE.md'));
  if (claude !== renderClaudeMd(arm.claudeMd, rules, arm.orchestratorNote)) problems.push('CLAUDE.md differs from the arm variant');

  let settings = null;
  try { settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf8')); } catch { problems.push('settings.json missing or invalid'); }
  if (settings && JSON.stringify(settings.hooks ?? {}) !== JSON.stringify(renderHooks(arm.hooks ?? {}, toolkitPath))) problems.push('settings.json hooks differ from the arm');

  const others = rules.filter((r) => !r.always);
  const expectIn = async (folder, list) => {
    if (!(await exists(join(claudeDir, folder, MARKER)))) problems.push(`${folder} missing or unmanaged`);
    for (const r of list) if (!(await exists(join(claudeDir, folder, r.file)))) problems.push(`${folder}/${r.file} missing`);
  };
  if (arm.rules === 'jev') await expectIn('jev-rules', others);
  if (arm.rules === 'native') { await expectIn('rules', others.filter((r) => r.paths.length)); if (await exists(join(claudeDir, 'jev-rules'))) problems.push('jev-rules present under a native arm'); }
  if (arm.rules === 'none') for (const f of Object.values(FOLDERS)) if (await exists(join(claudeDir, f, MARKER))) problems.push(`${f} present under a rules:none arm`);
  return problems.length ? { ok: false, problems } : { ok: true };
}
```
(`exists`, `MARKER`, `FOLDERS`, `renderHooks`, `loadRules`, `renderClaudeMd` already exist in the module.)

Arm files as specified in Interfaces.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/claude-md.test.mjs test/install.test.mjs`
Expected: all passing including the three new tests. The drift test expects exactly three problems: CLAUDE.md, hooks, and the one missing rule file; make sure the marker check does not add a fourth (the marker is still present).

- [ ] **Step 5: Commit**

```bash
git add src/targets/claude-md.mjs src/targets/install.mjs targets/websocket-inspector/arms/handback-jev.json targets/websocket-inspector/arms/handback-always.json test/claude-md.test.mjs test/install.test.mjs
git commit -m "feat: orchestrator notes in arms, hand-back always arm, verifyInstall"
```

---

### Task 4: Headless runner primitives: stream parser, target controller, results, quality

**Files:**
- Create: `src/bench/claude-run.mjs`, `src/bench/target.mjs`, `src/bench/results.mjs`, `src/bench/quality.mjs`
- Create: `test/fixtures/bench/stream.jsonl` (a hand-written stream-json transcript)
- Test: `test/claude-run.test.mjs`, `test/target.test.mjs`, `test/results.test.mjs`, `test/quality.test.mjs`

**Interfaces:**
- `parseStream(text)` → `{ result, events }` where `events` is every parsed JSON line (unparsable lines skipped) and `result` is the last event with `type === 'result'` or `null`.
- `extractResult(result)` → `{ subtype, session_id, num_turns, duration_ms, usage: { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }, per_model: { [model]: usage } | {}, total_cost_usd_reported: number | null, result_text }`. `per_model` comes from `result.modelUsage` when present (each entry's `inputTokens/outputTokens/cacheReadInputTokens/cacheCreationInputTokens` mapped to the snake_case usage shape), else `{}`. Missing fields become 0 or null.
- `toolUses(events)` → ordered list `[{ index, name, input, id }]` from `assistant` events' `message.content[]` items with `type === 'tool_use'`; `toolResults(events)` → `[{ index, tool_use_id }]` from `user` events' `tool_result` items.
- `runClaude({ cwd, prompt, model, maxTurns, allowedTools, env, spawnImpl, timeoutMs, rawOutPath })` → `{ code, stdout, stderr, timedOut }`, writing raw stdout to `rawOutPath` when given. Args exactly: `['-p', prompt, '--output-format', 'stream-json', '--verbose', '--model', model, '--max-turns', String(maxTurns), '--permission-mode', 'acceptEdits', '--allowedTools', allowedTools]`. Timeout kills the child.
- `assertTarget({ targetDir, allowedRoots, runGitImpl })` → throws with a specific message for: not under allowedRoots; not a git repo; tag `jev-baseline` missing. `resetTarget({ targetDir, runGitImpl })` runs `git reset --hard jev-baseline` then `git clean -fd` and returns `{ head }` (short SHA). `diffStat({ targetDir, runGitImpl })` → `{ files: string[], insertions, deletions }` from `git diff jev-baseline --numstat` plus untracked from `git ls-files --others --exclude-standard -z`; `diffText` → full `git diff jev-baseline` plus `git diff --no-index /dev/null <untracked>` is NOT needed; keep to tracked diff text and list untracked separately.
- `buildManifest({ runId, provider, config, claudeVersion, toolkitCommit, device, questionVersions })` → the spec §10.2 manifest object. `writeResult(resultsDir, record)` writes `<resultsDir>/<run_id>/<area>/<arm>/<task>-r<rep>.json` and returns the path; `writeManifest(resultsDir, manifest)`; `readRun(resultsDir, runId)` → `{ manifest, records: [...] }`.
- `goldSectionsScore(injectedIds, goldIds)` → `{ recall, precision }` (nulls when a denominator is 0). `readInjected(logDir, sessionId)` → ids from `<logDir>/state/dynamic-context/<session>.json` or `[]`. `handbackSignals(cardsDir, before)` → `{ cards: n, flags_raised: n }` counting card files created since the `before` set and `Flags:` lines not equal to `none`. `readFullDiffAfterAgent(events)` → `true | false | null`: `true` if a `Bash` tool_use whose `input.command` matches `/\bgit diff\b/` appears after the first `Agent` tool_result; `false` if an Agent call exists but no such diff follows; `null` if no Agent call at all.

- [ ] **Step 1: Write the stream fixture**

`test/fixtures/bench/stream.jsonl` (one JSON object per line; text between the braces is exact):
```
{"type":"system","subtype":"init","session_id":"sess-1","model":"deepseek-chat"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"I will dispatch a subagent."},{"type":"tool_use","id":"tu1","name":"Agent","input":{"prompt":"do it","subagent_type":"general-purpose"}}]}}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu1","content":"Edited src/A.kt. Tests pass."}]}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu2","name":"Bash","input":{"command":"git diff --stat"}}]}}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu2","content":"1 file changed"}]}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu3","name":"Bash","input":{"command":"git diff"}}]}}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu3","content":"diff --git a/src/A.kt b/src/A.kt"}]}}
not json at all
{"type":"result","subtype":"success","session_id":"sess-1","num_turns":4,"duration_ms":12345,"total_cost_usd":0.0123,"result":"Done.","usage":{"input_tokens":1000,"output_tokens":200,"cache_creation_input_tokens":50,"cache_read_input_tokens":3000},"modelUsage":{"deepseek-reasoner":{"inputTokens":600,"outputTokens":150,"cacheReadInputTokens":2000,"cacheCreationInputTokens":50},"deepseek-chat":{"inputTokens":400,"outputTokens":50,"cacheReadInputTokens":1000,"cacheCreationInputTokens":0}}}
```

- [ ] **Step 2: Write the failing tests**

`test/claude-run.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseStream, extractResult, toolUses, toolResults, runClaude } from '../src/bench/claude-run.mjs';
import { toolkitRoot } from '../src/client/config.mjs';

const fixture = () => readFile(join(toolkitRoot(), 'test', 'fixtures', 'bench', 'stream.jsonl'), 'utf8');

test('parseStream skips junk lines and finds the result event', async () => {
  const { result, events } = parseStream(await fixture());
  assert.equal(events.length, 8);
  assert.equal(result.subtype, 'success');
});

test('extractResult maps usage, per-model usage, and reported cost', async () => {
  const r = extractResult(parseStream(await fixture()).result);
  assert.equal(r.session_id, 'sess-1');
  assert.equal(r.num_turns, 4);
  assert.deepEqual(r.usage, { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 50, cache_read_input_tokens: 3000 });
  assert.deepEqual(r.per_model['deepseek-chat'], { input_tokens: 400, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 1000 });
  assert.equal(r.total_cost_usd_reported, 0.0123);
  assert.equal(r.result_text, 'Done.');
  assert.equal(extractResult(null).subtype, null);
});

test('toolUses and toolResults keep order and ids', async () => {
  const { events } = parseStream(await fixture());
  assert.deepEqual(toolUses(events).map((t) => [t.name, t.id]), [['Agent', 'tu1'], ['Bash', 'tu2'], ['Bash', 'tu3']]);
  assert.deepEqual(toolResults(events).map((t) => t.tool_use_id), ['tu1', 'tu2', 'tu3']);
});

function fakeSpawn({ stdout = '', code = 0, delayMs = 0 }) {
  return (cmd, args, opts) => {
    fakeSpawn.last = { cmd, args, opts };
    const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => p.emit('close', null);
    setTimeout(() => { if (stdout) p.stdout.emit('data', Buffer.from(stdout)); p.emit('close', code); }, delayMs);
    return p;
  };
}

test('runClaude builds the exact argument list, passes env and cwd, and writes raw output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jevrun-'));
  const raw = join(dir, 'raw.jsonl');
  const r = await runClaude({ cwd: '/target', prompt: 'p', model: 'm', maxTurns: 7, allowedTools: 'Read', env: { A: '1' }, spawnImpl: fakeSpawn({ stdout: '{"type":"result"}\n' }), timeoutMs: 1000, rawOutPath: raw });
  assert.equal(r.code, 0);
  assert.equal(r.timedOut, false);
  assert.deepEqual(fakeSpawn.last.args, ['-p', 'p', '--output-format', 'stream-json', '--verbose', '--model', 'm', '--max-turns', '7', '--permission-mode', 'acceptEdits', '--allowedTools', 'Read']);
  assert.equal(fakeSpawn.last.opts.cwd, '/target');
  assert.equal(fakeSpawn.last.opts.env.A, '1');
  assert.equal(await readFile(raw, 'utf8'), '{"type":"result"}\n');
});

test('runClaude times out and reports it', async () => {
  const r = await runClaude({ cwd: '/t', prompt: 'p', model: 'm', maxTurns: 1, allowedTools: '', env: {}, spawnImpl: fakeSpawn({ delayMs: 200 }), timeoutMs: 20 });
  assert.equal(r.timedOut, true);
});
```

`test/target.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertTarget, resetTarget, diffStat } from '../src/bench/target.mjs';

async function repo() {
  const dir = await mkdtemp(join(tmpdir(), 'jevtgt-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@e.com'); git('config', 'user.name', 't');
  await mkdir(join(dir, 'src')); await writeFile(join(dir, 'src', 'A.kt'), 'class A\n');
  git('add', '-A'); git('commit', '-q', '-m', 'base'); git('tag', 'jev-baseline');
  return dir;
}

test('assertTarget refuses outside roots, non-repos, and missing baseline tags', async () => {
  const dir = await repo();
  assert.doesNotThrow(() => assertTarget({ targetDir: dir, allowedRoots: [dir] }));
  assert.throws(() => assertTarget({ targetDir: dir, allowedRoots: ['/elsewhere'] }), /allowedRoots/);
  const bare = await mkdtemp(join(tmpdir(), 'jevbare-'));
  assert.throws(() => assertTarget({ targetDir: bare, allowedRoots: [bare] }), /git repository/);
  const untagged = await repo(); execFileSync('git', ['tag', '-d', 'jev-baseline'], { cwd: untagged });
  assert.throws(() => assertTarget({ targetDir: untagged, allowedRoots: [untagged] }), /jev-baseline/);
});

test('resetTarget discards tracked edits and untracked files; diffStat sees changes since baseline', async () => {
  const dir = await repo();
  await writeFile(join(dir, 'src', 'A.kt'), 'class A { val x = 1 }\n');
  await writeFile(join(dir, 'src', 'New.kt'), 'class New\n');
  const d = diffStat({ targetDir: dir });
  assert.deepEqual(d.files.sort(), ['src/A.kt', 'src/New.kt']);
  assert.equal(d.insertions, 1);
  assert.equal(d.deletions, 1);
  const r = resetTarget({ targetDir: dir });
  assert.match(r.head, /^[0-9a-f]{7,}$/);
  assert.deepEqual(diffStat({ targetDir: dir }), { files: [], insertions: 0, deletions: 0 });
});
```

`test/results.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildManifest, writeResult, writeManifest, readRun } from '../src/bench/results.mjs';

test('manifest carries the spec fields', () => {
  const m = buildManifest({ runId: 'r1', provider: { name: 'deepseek', baseUrl: 'https://api.deepseek.com/anthropic', models: { opus: 'a', sonnet: 'b', haiku: 'b', subagent: 'b' } }, config: { model: 'jev-1.13.0' }, claudeVersion: '2.1.278', toolkitCommit: 'abc1234', device: { label: 'laptop', os: 'darwin', node: 'v20.0.0' }, questionVersions: { 'comment-policy': '1' } });
  assert.equal(m.run_id, 'r1');
  assert.equal(m.provider, 'deepseek');
  assert.equal(m.base_url_host, 'api.deepseek.com');
  assert.deepEqual(m.models, { opus: 'a', sonnet: 'b', haiku: 'b', subagent: 'b' });
  assert.equal(m.jev_model, 'jev-1.13.0');
  assert.equal(m.claude_code_version, '2.1.278');
  assert.equal(m.toolkit_commit, 'abc1234');
  assert.equal(m.device.label, 'laptop');
  assert.match(m.date, /^\d{4}-\d{2}-\d{2}T/);
});

test('writeResult and readRun round-trip by run/area/arm/task/rep', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jevres-'));
  const rec = { run_id: 'r1', area: 'dynamic-context', arm: 'jev', task: '07-x', rep: 2, usage: {}, cost_usd: 0.1 };
  const p = await writeResult(dir, rec);
  assert.equal(p, join(dir, 'r1', 'dynamic-context', 'jev', '07-x-r2.json'));
  await writeManifest(dir, { run_id: 'r1' });
  const run = await readRun(dir, 'r1');
  assert.deepEqual(run.manifest, { run_id: 'r1' });
  assert.equal(run.records.length, 1);
  assert.equal(run.records[0].task, '07-x');
  assert.deepEqual(JSON.parse(await readFile(p, 'utf8')), rec);
});
```

`test/quality.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { goldSectionsScore, readInjected, handbackSignals, readFullDiffAfterAgent } from '../src/bench/quality.mjs';
import { parseStream } from '../src/bench/claude-run.mjs';
import { toolkitRoot } from '../src/client/config.mjs';

test('gold section recall and precision', () => {
  assert.deepEqual(goldSectionsScore(['compose', 'room'], ['compose', 'testing']), { recall: 0.5, precision: 0.5 });
  assert.deepEqual(goldSectionsScore([], ['compose']), { recall: 0, precision: null });
  assert.deepEqual(goldSectionsScore(['compose'], []), { recall: null, precision: 0 });
});

test('readInjected reads the hook state file or returns []', async () => {
  const logDir = await mkdtemp(join(tmpdir(), 'jevq-'));
  await mkdir(join(logDir, 'state', 'dynamic-context'), { recursive: true });
  await writeFile(join(logDir, 'state', 'dynamic-context', 'sess-1.json'), JSON.stringify({ injected: ['compose'] }));
  assert.deepEqual(await readInjected(logDir, 'sess-1'), ['compose']);
  assert.deepEqual(await readInjected(logDir, 'nope'), []);
});

test('handbackSignals counts new cards and raised flags', async () => {
  const cards = await mkdtemp(join(tmpdir(), 'jevcards-'));
  await writeFile(join(cards, 'old.card.md'), 'JEV hand-back check (a, m)\nFlags: none\n');
  const before = new Set(['old.card.md']);
  await writeFile(join(cards, 'tu1.card.md'), 'JEV hand-back check (a, m)\nFlags: claims tests added; no test files changed\n');
  await writeFile(join(cards, 'tu2.card.md'), 'JEV hand-back check (a, m)\nFlags: none\n');
  assert.deepEqual(await handbackSignals(cards, before), { cards: 2, flags_raised: 1 });
  assert.deepEqual(await handbackSignals(join(cards, 'missing'), new Set()), { cards: 0, flags_raised: 0 });
});

test('readFullDiffAfterAgent finds a git diff after the Agent result', async () => {
  const { events } = parseStream(await readFile(join(toolkitRoot(), 'test', 'fixtures', 'bench', 'stream.jsonl'), 'utf8'));
  assert.equal(readFullDiffAfterAgent(events), true);
  const noDiff = events.filter((e) => !(e.type === 'assistant' && JSON.stringify(e).includes('"git diff"')));
  assert.equal(readFullDiffAfterAgent(noDiff), false);
  assert.equal(readFullDiffAfterAgent(events.filter((e) => e.type === 'result')), null);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test test/claude-run.test.mjs test/target.test.mjs test/results.test.mjs test/quality.test.mjs`
Expected: FAIL, modules not found.

- [ ] **Step 4: Write the implementations**

`src/bench/claude-run.mjs`:
```js
import { spawn as nodeSpawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function parseStream(text) {
  const events = [];
  for (const line of String(text ?? '').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try { events.push(JSON.parse(t)); } catch { /* skip non-JSON lines */ }
  }
  const result = [...events].reverse().find((e) => e.type === 'result') ?? null;
  return { result, events };
}

const usageOf = (u) => ({
  input_tokens: u?.input_tokens ?? u?.inputTokens ?? 0,
  output_tokens: u?.output_tokens ?? u?.outputTokens ?? 0,
  cache_creation_input_tokens: u?.cache_creation_input_tokens ?? u?.cacheCreationInputTokens ?? 0,
  cache_read_input_tokens: u?.cache_read_input_tokens ?? u?.cacheReadInputTokens ?? 0,
});

export function extractResult(result) {
  if (!result) return { subtype: null, session_id: null, num_turns: 0, duration_ms: 0, usage: usageOf(null), per_model: {}, total_cost_usd_reported: null, result_text: '' };
  const per_model = Object.fromEntries(Object.entries(result.modelUsage ?? {}).map(([m, u]) => [m, usageOf(u)]));
  return {
    subtype: result.subtype ?? null,
    session_id: result.session_id ?? null,
    num_turns: result.num_turns ?? 0,
    duration_ms: result.duration_ms ?? 0,
    usage: usageOf(result.usage),
    per_model,
    total_cost_usd_reported: typeof result.total_cost_usd === 'number' ? result.total_cost_usd : null,
    result_text: typeof result.result === 'string' ? result.result : '',
  };
}

const items = (events, role, kind) => events.flatMap((e, index) => (e.type === role && Array.isArray(e.message?.content) ? e.message.content.filter((c) => c?.type === kind).map((c) => ({ index, ...c })) : []));

export function toolUses(events) {
  return items(events, 'assistant', 'tool_use').map(({ index, name, input, id }) => ({ index, name, input, id }));
}

export function toolResults(events) {
  return items(events, 'user', 'tool_result').map(({ index, tool_use_id }) => ({ index, tool_use_id }));
}

/** One headless Claude Code session. Never throws; the caller inspects code/timedOut. */
export function runClaude({ cwd, prompt, model, maxTurns, allowedTools, env, spawnImpl = nodeSpawn, timeoutMs = 20 * 60 * 1000, rawOutPath }) {
  return new Promise((resolve) => {
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--model', model, '--max-turns', String(maxTurns), '--permission-mode', 'acceptEdits', '--allowedTools', allowedTools];
    const child = spawnImpl('claude', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let timedOut = false; let done = false;
    const finish = async (code) => {
      if (done) return; done = true; clearTimeout(timer);
      if (rawOutPath) { try { await mkdir(dirname(rawOutPath), { recursive: true }); await writeFile(rawOutPath, stdout); } catch { /* best-effort */ } }
      resolve({ code, stdout, stderr, timedOut });
    };
    const timer = setTimeout(() => { timedOut = true; try { child.kill(); } catch { /* already gone */ } finish(null); }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });
    child.on('error', (e) => { stderr += e.message; finish(null); });
    child.on('close', (code) => finish(code));
  });
}
```

`src/bench/target.mjs`:
```js
import { isAllowedRoot } from '../client/guard.mjs';
import { runGit, isGitRepo } from '../adapters/handback-check/git.mjs';

export const BASELINE_TAG = 'jev-baseline';

export function assertTarget({ targetDir, allowedRoots, runGitImpl = runGit }) {
  if (!isAllowedRoot(targetDir, allowedRoots)) throw new Error(`${targetDir} is not under allowedRoots`);
  if (!isGitRepo(targetDir)) throw new Error(`${targetDir} is not a git repository`);
  if (runGitImpl(targetDir, ['rev-parse', '--verify', `refs/tags/${BASELINE_TAG}`]) === null) throw new Error(`tag ${BASELINE_TAG} is missing in ${targetDir}`);
}

/** Discards every uncommitted change in the target. Callers must have confirmed --yes-reset. */
export function resetTarget({ targetDir, runGitImpl = runGit }) {
  if (runGitImpl(targetDir, ['reset', '--hard', BASELINE_TAG]) === null) throw new Error('git reset failed');
  if (runGitImpl(targetDir, ['clean', '-fd']) === null) throw new Error('git clean failed');
  return { head: runGitImpl(targetDir, ['rev-parse', '--short', 'HEAD']) };
}

export function diffStat({ targetDir, runGitImpl = runGit }) {
  const numstat = runGitImpl(targetDir, ['diff', BASELINE_TAG, '--numstat']) ?? '';
  const files = []; let insertions = 0; let deletions = 0;
  for (const line of numstat.split('\n').filter(Boolean)) {
    const [ins, del, path] = line.split('\t');
    files.push(path); insertions += Number(ins) || 0; deletions += Number(del) || 0;
  }
  const untracked = (runGitImpl(targetDir, ['ls-files', '--others', '--exclude-standard', '-z']) ?? '').split('\0').filter(Boolean);
  for (const u of untracked) files.push(u);
  return { files, insertions, deletions };
}

export function diffText({ targetDir, runGitImpl = runGit }) {
  return runGitImpl(targetDir, ['diff', BASELINE_TAG]) ?? '';
}
```
Note on `diffStat`: untracked files are listed in `files` but their lines are not counted, because `git diff jev-baseline --numstat` only covers tracked paths; the test therefore expects `insertions 1, deletions 1` for the one replaced line in `A.kt`.

`src/bench/results.mjs`:
```js
import { mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export function buildManifest({ runId, provider, config, claudeVersion, toolkitCommit, device, questionVersions }) {
  let host = null;
  try { host = provider.baseUrl ? new URL(provider.baseUrl).host : 'api.anthropic.com'; } catch { host = null; }
  return {
    run_id: runId, date: new Date().toISOString(), device, provider: provider.name, base_url_host: host,
    models: provider.models, jev_model: config.model, question_versions: questionVersions ?? {},
    claude_code_version: claudeVersion, toolkit_commit: toolkitCommit,
  };
}

export async function writeResult(resultsDir, record) {
  const dir = join(resultsDir, record.run_id, record.area, record.arm);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${record.task}-r${record.rep}.json`);
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`);
  return path;
}

export async function writeManifest(resultsDir, manifest) {
  await mkdir(join(resultsDir, manifest.run_id), { recursive: true });
  await writeFile(join(resultsDir, manifest.run_id, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p)));
    else if (name.endsWith('.json') && name !== 'manifest.json') out.push(p);
  }
  return out;
}

export async function readRun(resultsDir, runId) {
  const base = join(resultsDir, runId);
  const manifest = JSON.parse(await readFile(join(base, 'manifest.json'), 'utf8'));
  const records = [];
  for (const p of await walk(base)) records.push(JSON.parse(await readFile(p, 'utf8')));
  return { manifest, records };
}
```

`src/bench/quality.mjs`:
```js
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { toolUses, toolResults } from './claude-run.mjs';

export function goldSectionsScore(injected, gold) {
  const i = new Set(injected); const g = new Set(gold);
  const hit = [...i].filter((x) => g.has(x)).length;
  return { recall: g.size ? hit / g.size : null, precision: i.size ? hit / i.size : null };
}

export async function readInjected(logDir, sessionId) {
  try {
    const data = JSON.parse(await readFile(join(logDir, 'state', 'dynamic-context', `${String(sessionId).replace(/[^A-Za-z0-9_-]/g, '_')}.json`), 'utf8'));
    return Array.isArray(data.injected) ? data.injected : [];
  } catch { return []; }
}

export async function listCards(cardsDir) {
  try { return new Set((await readdir(cardsDir)).filter((f) => f.endsWith('.card.md'))); } catch { return new Set(); }
}

export async function handbackSignals(cardsDir, before) {
  const now = await listCards(cardsDir);
  const fresh = [...now].filter((f) => !before.has(f));
  let flags = 0;
  for (const f of fresh) {
    const text = await readFile(join(cardsDir, f), 'utf8');
    const line = text.split('\n').find((l) => l.startsWith('Flags:')) ?? 'Flags: none';
    if (line.trim() !== 'Flags: none') flags += 1;
  }
  return { cards: fresh.length, flags_raised: flags };
}

export function readFullDiffAfterAgent(events) {
  const uses = toolUses(events);
  const agent = uses.find((t) => t.name === 'Agent' || t.name === 'Task');
  if (!agent) return null;
  const agentResult = toolResults(events).find((r) => r.tool_use_id === agent.id);
  const after = agentResult ? agentResult.index : agent.index;
  return uses.some((t) => t.index > after && t.name === 'Bash' && /\bgit diff\b/.test(String(t.input?.command ?? '')));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/claude-run.test.mjs test/target.test.mjs test/results.test.mjs test/quality.test.mjs`
Expected: 13 passing.

- [ ] **Step 6: Commit**

```bash
git add src/bench/claude-run.mjs src/bench/target.mjs src/bench/results.mjs src/bench/quality.mjs test/fixtures/bench/stream.jsonl test/claude-run.test.mjs test/target.test.mjs test/results.test.mjs test/quality.test.mjs
git commit -m "feat: headless stream parser, target controller, results store, quality signals"
```

---

### Task 5: Task loader, benchmark runner, and `jev-bench`

**Files:**
- Create: `src/bench/tasks.mjs`, `src/bench/runner.mjs`, `bin/jev-bench.mjs`
- Test: `test/tasks.test.mjs`, `test/runner.test.mjs`

**Interfaces:**
- Task file format (`targets/websocket-inspector/tasks/NN-slug.md`):
```
---
id: 07-add-reconnect-backoff
category: multi-file
gold_sections:
  - websocket
  - coroutines
gold_tier: opus
expect_files:
  - "inspector/src/main/**/Chucker*.kt"
needs_subagent: true
---
<prompt text>
```
- `loadTasks(dir, ids = 'all')` → `[{ id, category, gold_sections: string[], gold_tier, expect_files: string[], needs_subagent: boolean, prompt, file }]` sorted by filename; `ids` may be `'all'` or an array of ids (unknown id → throw).
- `armFileFor(area, arm)` → `<area>-<arm>.json` except `handback` maps to `handback-<arm>.json` (arms are `always|jev`), `comment-policy` to `comment-policy-<arm>.json` (`none|llm|jev`), `dynamic-context` to `dynamic-context-<arm>.json` (`full|jev|native`). Unknown pair → throw.
- `runBenchmark(opts)` with
  `opts = { area, arm, taskIds, reps, runId, targetDir, targetName, config, provider, env, resultsDir, claudeVersion, toolkitCommit, device, yesReset, compile, spawnImpl?, runGitImpl?, gradleImpl?, log? }`.
  Steps per task×rep: `assertTarget` once; `resetTarget`; `installArm`; `verifyInstall` (throw on drift); `before = listCards(<logDir>/handback)`; `runClaude` with `model = provider.models[config.benchmark?.orchestratorTier ?? 'opus']`, `maxTurns = config.benchmark?.maxTurns ?? 30`, `allowedTools = ALLOWED_TOOLS`, env from `armEnv` merged over `process.env` minus nothing, `rawOutPath = <resultsDir>/<run>/<area>/<arm>/<task>-r<rep>.claude.jsonl`; parse; `diffStat`/`diffText` written to `<…>-r<rep>.diff`; Jev calls = lines of `<logDir>/<area>.jsonl` (and `<area>-llm.jsonl` for the llm arm) whose `sessionId === result.session_id`; cost via `costFromModelUsage(per_model, provider.pricing)` when `per_model` is non-empty else `costFromUsage(usage, model, pricing)`; quality per area (see below); optional compile via `gradleImpl` (default spawns `./gradlew :inspector:compileDebugKotlin` in the target, 10-minute timeout); `writeResult`. Manifest written once at start. Returns `{ written: string[], failures: [{ task, rep, error }] }`. A failed task (timeout, non-zero exit, drift) is recorded with `subtype: 'failed'` and listed in `failures`; the run continues.
  For `area === 'handback'` only tasks with `needs_subagent` run; `quality.flags_raised` and `quality.orchestrator_read_full_diff` are filled. For `dynamic-context`: `gold_sections_recall/precision` from `readInjected(logDir, session_id)` for the `jev` arm; for `full`, injected = all non-core ids; for `native`, `null`. For `comment-policy`: `violations_remaining: null` (filled by labels at report time).
- `ALLOWED_TOOLS = 'Read,Edit,Write,MultiEdit,Grep,Glob,Bash(git *),Bash(./gradlew *),Agent'`.
- Result record = spec §10.3 shape plus `raw_result_path`, `diff_path`, `orchestrator_model`, `subagent_model`, `jev: { calls, latency_ms_total, est_tokens, cost_usd, answers: [{ area, ids, confidence_min, truncated }] }` where `cost_usd = est_tokens / 1e6 × config.benchmark.jevInputPricePerMTok`.
- `bin/jev-bench.mjs --area <a> --arm <arm> --target <dir> --run-id <id> [--tasks all|id,id] [--reps 1] [--provider name] [--compile] --yes-reset`. Without `--yes-reset` it prints what would be reset and exits 1. Exit 0 when no failures, 2 when some tasks failed (results still written), 3 on refusal (target checks, missing token, config missing).

- [ ] **Step 1: Write the failing tests**

`test/tasks.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTasks, armFileFor } from '../src/bench/tasks.mjs';

test('loadTasks parses frontmatter lists and booleans and keeps the prompt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jevtasks-'));
  await writeFile(join(dir, '02-b.md'), '---\nid: 02-b\ncategory: info\ngold_sections:\n  - room\ngold_tier: haiku\nexpect_files: []\nneeds_subagent: false\n---\nWhat is the DB version?\n');
  await writeFile(join(dir, '01-a.md'), '---\nid: 01-a\ncategory: multi-file\ngold_sections:\n  - websocket\n  - coroutines\ngold_tier: opus\nexpect_files:\n  - "inspector/**/Chucker*.kt"\nneeds_subagent: true\n---\nDo the thing.\n');
  const all = await loadTasks(dir);
  assert.deepEqual(all.map((t) => t.id), ['01-a', '02-b']);
  assert.deepEqual(all[0].gold_sections, ['websocket', 'coroutines']);
  assert.equal(all[0].needs_subagent, true);
  assert.equal(all[1].needs_subagent, false);
  assert.deepEqual(all[1].expect_files, []);
  assert.equal(all[1].prompt, 'What is the DB version?\n');
  assert.deepEqual((await loadTasks(dir, ['02-b'])).map((t) => t.id), ['02-b']);
  await assert.rejects(loadTasks(dir, ['nope']), /unknown task/);
});

test('armFileFor maps area and arm to a file name', () => {
  assert.equal(armFileFor('dynamic-context', 'jev'), 'dynamic-context-jev.json');
  assert.equal(armFileFor('comment-policy', 'llm'), 'comment-policy-llm.json');
  assert.equal(armFileFor('handback', 'always'), 'handback-always.json');
  assert.throws(() => armFileFor('handback', 'native'), /unknown/);
  assert.throws(() => armFileFor('router', 'jev'), /unknown/);
});
```

`test/runner.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runBenchmark } from '../src/bench/runner.mjs';
import { DEFAULTS, toolkitRoot } from '../src/client/config.mjs';

async function target() {
  const dir = await mkdtemp(join(tmpdir(), 'jevbench-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@e.com'); git('config', 'user.name', 't');
  await mkdir(join(dir, 'src')); await writeFile(join(dir, 'src', 'A.kt'), 'class A\n');
  await writeFile(join(dir, '.gitignore'), 'CLAUDE.md\n.claude/\n');
  git('add', '-A'); git('commit', '-q', '-m', 'base'); git('tag', 'jev-baseline');
  return dir;
}

function fakeClaude(streamText, { edit } = {}) {
  return (cmd, args, opts) => {
    fakeClaude.calls.push({ cmd, args, opts });
    const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => {};
    setTimeout(async () => {
      if (edit) await writeFile(join(opts.cwd, 'src', 'A.kt'), 'class A { val x = 1 }\n');
      p.stdout.emit('data', Buffer.from(streamText)); p.emit('close', 0);
    }, 0);
    return p;
  };
}
fakeClaude.calls = [];

const provider = { name: 'deepseek', baseUrl: 'https://api.deepseek.com/anthropic', authTokenEnv: 'DEEPSEEK_API_KEY', models: { opus: 'deepseek-reasoner', sonnet: 'deepseek-chat', haiku: 'deepseek-chat', subagent: 'deepseek-chat' }, pricing: { 'deepseek-reasoner': { input: 1, output: 2, cache_read: 0.5, cache_write: 1 }, 'deepseek-chat': { input: 1, output: 2, cache_read: 0.5, cache_write: 1 } } };

async function setup() {
  const tgt = await target();
  const work = await mkdtemp(join(tmpdir(), 'jevwork-'));
  const logDir = join(work, 'logs');
  const config = { ...DEFAULTS, logDir, recordingsDir: join(work, 'rec'), allowedRoots: [tgt], apiKey: 'K', disabled: false, configMissing: false, configInvalid: false, benchmark: { maxTurns: 5, orchestratorTier: 'opus', jevInputPricePerMTok: 0.042 } };
  const tasksDir = join(work, 'tasks');
  await mkdir(tasksDir);
  await writeFile(join(tasksDir, '01-a.md'), '---\nid: 01-a\ncategory: one-file\ngold_sections:\n  - compose\n  - room\ngold_tier: sonnet\nexpect_files: []\nneeds_subagent: true\n---\nEdit A.\n');
  const stream = await readFile(join(toolkitRoot(), 'test', 'fixtures', 'bench', 'stream.jsonl'), 'utf8');
  return { tgt, work, logDir, config, tasksDir, stream };
}

const base = (s, extra) => ({ area: 'dynamic-context', arm: 'jev', taskIds: 'all', reps: 1, runId: 'run1', targetDir: s.tgt, targetName: 'websocket-inspector', config: s.config, provider, env: { DEEPSEEK_API_KEY: 'tok', PATH: process.env.PATH }, resultsDir: join(s.work, 'results'), claudeVersion: '2.1.278', toolkitCommit: 'abc', device: { label: 'test', os: 'darwin', node: process.version }, yesReset: true, compile: false, tasksDir: s.tasksDir, log: () => {}, ...extra });

test('a run resets, installs, verifies, runs claude, and writes manifest, raw, diff, and result with computed cost and quality', async () => {
  const s = await setup();
  await mkdir(join(s.logDir, 'state', 'dynamic-context'), { recursive: true });
  await writeFile(join(s.logDir, 'state', 'dynamic-context', 'sess-1.json'), JSON.stringify({ injected: ['compose', 'testing'] }));
  await mkdir(s.logDir, { recursive: true });
  await writeFile(join(s.logDir, 'dynamic-context.jsonl'), JSON.stringify({ area: 'dynamic-context', sessionId: 'sess-1', ok: true, latencyMs: 120, estTokens: 800, truncated: false, answers: { relevant_compose: { noul: 0.9 } } }) + '\n' + JSON.stringify({ area: 'dynamic-context', sessionId: 'other', ok: true, latencyMs: 5, estTokens: 5 }) + '\n');
  await writeFile(join(s.tgt, 'src', 'Dirty.kt'), 'left over\n');
  fakeClaude.calls = [];
  const r = await runBenchmark(base(s, { spawnImpl: fakeClaude(s.stream, { edit: true }) }));
  assert.deepEqual(r.failures, []);
  assert.equal(r.written.length, 1);
  const rec = JSON.parse(await readFile(r.written[0], 'utf8'));
  assert.equal(rec.run_id, 'run1'); assert.equal(rec.area, 'dynamic-context'); assert.equal(rec.arm, 'jev'); assert.equal(rec.task, '01-a'); assert.equal(rec.rep, 1);
  assert.equal(rec.usage.input_tokens, 1000);
  assert.equal(rec.subtype, 'success');
  assert.equal(rec.orchestrator_model, 'deepseek-reasoner');
  assert.equal(rec.subagent_model, 'deepseek-chat');
  const expectedCost = (600 + 400) / 1e6 * 1 + (150 + 50) / 1e6 * 2 + (2000 + 1000) / 1e6 * 0.5 + (50 + 0) / 1e6 * 1;
  assert.equal(rec.cost_usd.toFixed(8), expectedCost.toFixed(8));
  assert.deepEqual(rec.diff.files, ['src/A.kt']);
  assert.equal(rec.jev.calls, 1);
  assert.equal(rec.jev.est_tokens, 800);
  assert.equal(rec.jev.cost_usd.toFixed(8), (800 / 1e6 * 0.042).toFixed(8));
  assert.equal(rec.quality.gold_sections_recall, 0.5);
  assert.equal(rec.quality.gold_sections_precision, 0.5);
  assert.equal(rec.quality.compile, null);
  const manifest = JSON.parse(await readFile(join(s.work, 'results', 'run1', 'manifest.json'), 'utf8'));
  assert.equal(manifest.provider, 'deepseek');
  assert.ok((await readFile(rec.raw_result_path, 'utf8')).includes('"type":"result"'));
  assert.match(await readFile(rec.diff_path, 'utf8'), /val x = 1/);
  const files = await readdir(join(s.tgt, 'src'));
  assert.equal(files.includes('Dirty.kt'), false);
  const call = fakeClaude.calls[0];
  assert.equal(call.opts.cwd, s.tgt);
  assert.equal(call.opts.env.ANTHROPIC_AUTH_TOKEN, 'tok');
  assert.equal(call.opts.env.JEV_RUN_ID, 'run1');
  assert.ok(call.args.includes('deepseek-reasoner'));
  assert.match(await readFile(join(s.tgt, 'CLAUDE.md'), 'utf8'), /injected per task by the JEV dynamic-context hook/);
});

test('handback area runs only subagent tasks and fills its quality fields; a failing claude run is recorded and reported', async () => {
  const s = await setup();
  await writeFile(join(s.tasksDir, '02-info.md'), '---\nid: 02-info\ncategory: info\ngold_sections: []\ngold_tier: haiku\nexpect_files: []\nneeds_subagent: false\n---\nExplain.\n');
  await mkdir(join(s.logDir, 'handback'), { recursive: true });
  const spawnImpl = (cmd, args, opts) => {
    const p = fakeClaude(s.stream)(cmd, args, opts);
    writeFile(join(s.logDir, 'handback', 'tu1.card.md'), 'JEV hand-back check (general-purpose, deepseek-chat)\nFlags: claims tests added; no test files changed\n');
    return p;
  };
  const r = await runBenchmark(base(s, { area: 'handback', arm: 'jev', spawnImpl }));
  assert.equal(r.written.length, 1);
  const rec = JSON.parse(await readFile(r.written[0], 'utf8'));
  assert.equal(rec.task, '01-a');
  assert.equal(rec.quality.flags_raised, 1);
  assert.equal(rec.quality.orchestrator_read_full_diff, true);
  const failing = (cmd, args, opts) => { const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => {}; setTimeout(() => p.emit('close', 1), 0); return p; };
  const f = await runBenchmark(base(s, { area: 'comment-policy', arm: 'none', runId: 'run2', spawnImpl: failing }));
  assert.equal(f.failures.length, 1);
  assert.match(f.failures[0].error, /exit 1/);
  assert.equal(JSON.parse(await readFile(f.written[0], 'utf8')).subtype, 'failed');
});

test('refusals: no --yes-reset, target outside roots, missing token', async () => {
  const s = await setup();
  await assert.rejects(runBenchmark(base(s, { yesReset: false })), /--yes-reset/);
  await assert.rejects(runBenchmark(base(s, { config: { ...s.config, allowedRoots: ['/elsewhere'] } })), /allowedRoots/);
  await assert.rejects(runBenchmark(base(s, { env: {} })), /DEEPSEEK_API_KEY/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/tasks.test.mjs test/runner.test.mjs`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the implementations**

`src/bench/tasks.mjs`:
```js
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFrontmatter } from '../targets/frontmatter.mjs';

const ARMS = { 'dynamic-context': ['full', 'jev', 'native'], 'comment-policy': ['none', 'llm', 'jev'], handback: ['always', 'jev'] };

export function armFileFor(area, arm) {
  if (!ARMS[area]?.includes(arm)) throw new Error(`unknown area/arm: ${area}/${arm}`);
  return `${area}-${arm}.json`;
}

export async function loadTasks(dir, ids = 'all') {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
  const tasks = [];
  for (const file of files) {
    const { meta, body } = parseFrontmatter(await readFile(join(dir, file), 'utf8'));
    tasks.push({ id: meta.id, category: meta.category ?? '', gold_sections: Array.isArray(meta.gold_sections) ? meta.gold_sections : [], gold_tier: meta.gold_tier ?? null, expect_files: Array.isArray(meta.expect_files) ? meta.expect_files : [], needs_subagent: meta.needs_subagent === true, prompt: body, file });
  }
  if (ids === 'all') return tasks;
  return ids.map((id) => { const t = tasks.find((x) => x.id === id); if (!t) throw new Error(`unknown task ${id}`); return t; });
}
```
`parseFrontmatter` already returns extra scalar keys and lists on `meta`, and turns `true`/`false` into booleans; `expect_files: []` parses as an empty array.

`src/bench/runner.mjs`:
```js
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { toolkitRoot } from '../client/config.mjs';
import { installArm, verifyInstall } from '../targets/install.mjs';
import { loadRules } from '../targets/rules.mjs';
import { armEnv } from './providers.mjs';
import { costFromUsage, costFromModelUsage } from './pricing.mjs';
import { runClaude, parseStream, extractResult } from './claude-run.mjs';
import { assertTarget, resetTarget, diffStat, diffText } from './target.mjs';
import { buildManifest, writeManifest, writeResult } from './results.mjs';
import { goldSectionsScore, readInjected, listCards, handbackSignals, readFullDiffAfterAgent } from './quality.mjs';
import { loadTasks, armFileFor } from './tasks.mjs';

export const ALLOWED_TOOLS = 'Read,Edit,Write,MultiEdit,Grep,Glob,Bash(git *),Bash(./gradlew *),Agent';

async function jevCalls(logDir, areas, sessionId, pricePerMTok) {
  const answers = []; let calls = 0; let latency = 0; let tokens = 0;
  for (const area of areas) {
    let text = '';
    try { text = await readFile(join(logDir, `${area}.jsonl`), 'utf8'); } catch { continue; }
    for (const line of text.split('\n').filter(Boolean)) {
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.sessionId !== sessionId || e.event === 'skipped') continue;
      calls += 1; latency += e.latencyMs ?? 0; tokens += e.estTokens ?? 0;
      const confs = Object.values(e.answers ?? {}).map((a) => a?.confidence ?? (typeof a?.noul === 'number' ? Math.max(a.noul, 1 - a.noul) : null)).filter((c) => c !== null);
      answers.push({ area, ids: Object.keys(e.answers ?? {}), confidence_min: confs.length ? Math.min(...confs) : null, truncated: e.truncated ?? false });
    }
  }
  return { calls, latency_ms_total: latency, est_tokens: tokens, cost_usd: (tokens / 1e6) * pricePerMTok, answers };
}

function runGradle(targetDir, spawnImpl) {
  return new Promise((resolve) => {
    const child = spawnImpl('./gradlew', [':inspector:compileDebugKotlin'], { cwd: targetDir, stdio: 'ignore' });
    const timer = setTimeout(() => { try { child.kill(); } catch { /* gone */ } resolve(false); }, 10 * 60 * 1000);
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
    child.on('error', () => { clearTimeout(timer); resolve(false); });
  });
}

async function qualityFor({ area, arm, task, logDir, sessionId, events, rules, cardsBefore }) {
  const q = { compile: null, gold_sections_recall: null, gold_sections_precision: null, violations_remaining: null, flags_raised: null, orchestrator_read_full_diff: null };
  if (area === 'dynamic-context') {
    const injected = arm === 'jev' ? await readInjected(logDir, sessionId) : arm === 'full' ? rules.filter((r) => !r.always).map((r) => r.id) : null;
    if (injected) Object.assign(q, { gold_sections_recall: goldSectionsScore(injected, task.gold_sections).recall, gold_sections_precision: goldSectionsScore(injected, task.gold_sections).precision });
  }
  if (area === 'handback') {
    const s = await handbackSignals(join(logDir, 'handback'), cardsBefore);
    q.flags_raised = s.flags_raised;
    q.orchestrator_read_full_diff = readFullDiffAfterAgent(events);
  }
  return q;
}

/** One benchmark run: every selected task, `reps` times, under one arm. Never throws per task; refusals throw before any reset. */
export async function runBenchmark(opts) {
  const { area, arm, taskIds = 'all', reps = 1, runId, targetDir, targetName = 'websocket-inspector', config, provider, env, resultsDir, claudeVersion, toolkitCommit, device, yesReset, compile = false } = opts;
  const spawnImpl = opts.spawnImpl ?? nodeSpawn;
  const runGitImpl = opts.runGitImpl;
  const log = opts.log ?? ((m) => console.log(m));
  if (!yesReset) throw new Error('refusing to reset the target without --yes-reset (it discards uncommitted changes)');
  assertTarget({ targetDir, allowedRoots: config.allowedRoots, runGitImpl });
  const runEnv = { ...process.env, ...env, ...armEnv({ provider, env, runId, logDir: config.logDir }) };

  const base = join(toolkitRoot(), 'targets', targetName);
  const armFile = join(base, 'arms', armFileFor(area, arm));
  const rulesDir = join(base, 'rules');
  const rules = await loadRules(rulesDir);
  let tasks = await loadTasks(opts.tasksDir ?? join(base, 'tasks'), taskIds);
  if (area === 'handback') tasks = tasks.filter((t) => t.needs_subagent);

  const model = provider.models[config.benchmark?.orchestratorTier ?? 'opus'];
  const maxTurns = config.benchmark?.maxTurns ?? 30;
  const pricePerMTok = config.benchmark?.jevInputPricePerMTok ?? 0.042;
  await writeManifest(resultsDir, buildManifest({ runId, provider, config, claudeVersion, toolkitCommit, device }));

  const written = []; const failures = [];
  for (const task of tasks) {
    for (let rep = 1; rep <= reps; rep += 1) {
      const stem = join(resultsDir, runId, area, arm, `${task.id}-r${rep}`);
      await mkdir(join(resultsDir, runId, area, arm), { recursive: true });
      const record = { run_id: runId, area, arm, task: task.id, rep, orchestrator_model: model, subagent_model: runEnv.CLAUDE_CODE_SUBAGENT_MODEL, raw_result_path: `${stem}.claude.jsonl`, diff_path: `${stem}.diff` };
      try {
        log(`[${area}/${arm}] ${task.id} r${rep}: reset + install`);
        resetTarget({ targetDir, runGitImpl });
        await installArm({ targetDir, armFile, rulesDir, toolkitPath: toolkitRoot() });
        const v = await verifyInstall({ targetDir, armFile, rulesDir, toolkitPath: toolkitRoot() });
        if (!v.ok) throw new Error(`install drift: ${v.problems.join('; ')}`);
        const cardsBefore = await listCards(join(config.logDir, 'handback'));
        log(`[${area}/${arm}] ${task.id} r${rep}: claude -p`);
        const run = await runClaude({ cwd: targetDir, prompt: task.prompt, model, maxTurns, allowedTools: ALLOWED_TOOLS, env: runEnv, spawnImpl, rawOutPath: record.raw_result_path });
        const { result, events } = parseStream(run.stdout);
        const res = extractResult(result);
        if (run.timedOut) throw new Error('claude timed out');
        if (run.code !== 0) throw new Error(`claude exit ${run.code}: ${run.stderr.slice(0, 300)}`);
        if (!result) throw new Error('no result event in stream');
        const stat = diffStat({ targetDir, runGitImpl });
        await writeFile(record.diff_path, diffText({ targetDir, runGitImpl }));
        const cost = Object.keys(res.per_model).length ? costFromModelUsage(res.per_model, provider.pricing) : costFromUsage(res.usage, model, provider.pricing);
        const areasForJev = area === 'comment-policy' && arm === 'llm' ? ['comment-policy-llm'] : area === 'handback' ? ['handback-check'] : [area];
        Object.assign(record, {
          subtype: res.subtype, session_id: res.session_id, num_turns: res.num_turns, duration_ms: res.duration_ms,
          usage: { ...res.usage, per_model: res.per_model }, cost_usd: cost.cost_usd, cost_warnings: cost.warnings ?? (cost.warning ? [cost.warning] : []),
          total_cost_usd_reported: res.total_cost_usd_reported,
          diff: { ...stat, expect_files_hit: null },
          jev: await jevCalls(config.logDir, areasForJev, res.session_id, pricePerMTok),
          quality: await qualityFor({ area, arm, task, logDir: config.logDir, sessionId: res.session_id, events, rules, cardsBefore }),
        });
        if (compile) record.quality.compile = await (opts.gradleImpl ?? runGradle)(targetDir, spawnImpl);
      } catch (e) {
        record.subtype = 'failed'; record.error = e.message;
        failures.push({ task: task.id, rep, error: e.message });
        log(`[${area}/${arm}] ${task.id} r${rep}: FAILED ${e.message}`);
      }
      written.push(await writeResult(resultsDir, record));
    }
  }
  return { written, failures };
}
```

`bin/jev-bench.mjs`:
```js
#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { hostname, platform } from 'node:os';
import { loadConfig, toolkitRoot } from '../src/client/config.mjs';
import { resolveProvider } from '../src/bench/providers.mjs';
import { runBenchmark } from '../src/bench/runner.mjs';
import { assertTarget } from '../src/bench/target.mjs';

function sh(cmd, args, cwd) { try { return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return 'unknown'; } }

async function main() {
  let values;
  try {
    ({ values } = parseArgs({ options: { area: { type: 'string' }, arm: { type: 'string' }, target: { type: 'string' }, 'run-id': { type: 'string' }, tasks: { type: 'string', default: 'all' }, reps: { type: 'string', default: '1' }, provider: { type: 'string' }, compile: { type: 'boolean', default: false }, 'yes-reset': { type: 'boolean', default: false } } }));
  } catch (e) { console.error(`usage error: ${e.message}`); return 1; }
  if (!values.area || !values.arm || !values.target || !values['run-id']) {
    console.error('usage: jev-bench --area <a> --arm <arm> --target <dir> --run-id <id> [--tasks all|id,id] [--reps n] [--provider name] [--compile] --yes-reset');
    return 1;
  }
  const config = loadConfig();
  if (config.configMissing) { console.error('refused: jev.config.json is missing'); return 3; }
  const targetDir = resolve(values.target);
  try { assertTarget({ targetDir, allowedRoots: config.allowedRoots }); } catch (e) { console.error(`refused: ${e.message}`); return 3; }
  if (!values['yes-reset']) { console.error(`This will run git reset --hard jev-baseline && git clean -fd in ${targetDir} before every task. Re-run with --yes-reset to confirm.`); return 1; }
  let provider;
  try { provider = resolveProvider(config, values.provider); } catch (e) { console.error(`refused: ${e.message}`); return 3; }
  try {
    const r = await runBenchmark({
      area: values.area, arm: values.arm, taskIds: values.tasks === 'all' ? 'all' : values.tasks.split(','), reps: Number(values.reps) || 1,
      runId: values['run-id'], targetDir, config, provider, env: process.env, resultsDir: join(toolkitRoot(), 'results'),
      claudeVersion: sh('claude', ['--version']), toolkitCommit: sh('git', ['rev-parse', '--short', 'HEAD'], toolkitRoot()),
      device: { label: hostname(), os: platform(), node: process.version }, yesReset: true, compile: values.compile,
    });
    console.log(`written ${r.written.length} result file(s); failures ${r.failures.length}`);
    for (const f of r.failures) console.log(`  FAILED ${f.task} r${f.rep}: ${f.error}`);
    return r.failures.length ? 2 : 0;
  } catch (e) { console.error(`refused: ${e.message}`); return 3; }
}

process.exitCode = await main();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/tasks.test.mjs test/runner.test.mjs`
Expected: 5 passing. The first runner test relies on the real `targets/websocket-inspector` arms and rules (installed into the temp target) and on the stream fixture's `session_id` `sess-1` matching the pre-written state and log lines.

- [ ] **Step 5: Commit**

```bash
chmod +x bin/jev-bench.mjs
git add src/bench/tasks.mjs src/bench/runner.mjs bin/jev-bench.mjs test/tasks.test.mjs test/runner.test.mjs
git commit -m "feat: benchmark runner and jev-bench"
```

---

### Task 6: The fifteen benchmark tasks

**Files:**
- Create: `targets/websocket-inspector/tasks/01-…md` through `15-…md`
- Test: `test/tasks-shipped.test.mjs`

**Interfaces:** the task format from Task 5. Every prompt is about the WebSocket Inspector code as surveyed. Subagent tasks include the sentence "Dispatch one general-purpose subagent in the foreground to do the implementation, then review its diff." Each prompt ends with "Do not run Gradle." except the compile-check task.

- [ ] **Step 1: Write the fifteen files**

| file | category | gold_sections | gold_tier | expect_files | subagent | prompt |
|---|---|---|---|---|---|---|
| 01-theme-color.md | one-file | compose | sonnet | `inspector/**/SocketFrameItemComponent.kt` | no | In `SocketFrameItemComponent.kt`, replace the hardcoded `Color.Gray` with the matching `MaterialTheme.colorScheme` token and keep the visual weight the same. Do not run Gradle. |
| 02-lazy-keys.md | one-file | compose | sonnet | `inspector/**/SocketDetailScreen.kt` | no | Give the `LazyColumn` in `SocketDetailScreen.kt` a stable `key` for its items using the frame id. Do not run Gradle. |
| 03-previews.md | one-file | compose | sonnet | `inspector/**/SocketListScreen.kt` | no | Add a light and a dark `@Preview` to `SocketListScreen`, both wrapped in `MaterialTheme`, following the project's preview rule. Do not run Gradle. |
| 04-cancel-scope.md | one-file | coroutines, gotchas | sonnet | `app/**/MainActivity.kt` | no | `MainActivity` creates a coroutine scope that is never cancelled. Cancel it in `onDestroy` and remove the comment-only body that is there now. Do not run Gradle. |
| 05-db-version.md | one-file | room | sonnet | `inspector/**/InspectorDatabase.kt` | no | Bump `InspectorDatabase` to version 3 and add an empty `Migration(2, 3)` registered on the builder, keeping `fallbackToDestructiveMigration()` for now. Do not run Gradle. |
| 06-clean-decorator-comments.md | comment-heavy | comments, websocket | sonnet | `inspector/**/ChuckerScarletWebSocket.kt` | no | `ChuckerScarletWebSocket.kt` contains thinking-aloud and narration comments. Remove every comment that narrates the code or speculates about the compiler; keep only comments that state a reason. Change no code. Do not run Gradle. |
| 07-comment-mainactivity.md | comment-heavy | comments | sonnet | `app/**/MainActivity.kt` | no | Rewrite the comments in `MainActivity.kt` so each remaining comment explains a reason, not what the next line does. Delete the rest. Change no code. Do not run Gradle. |
| 08-session-tracker-doc.md | comment-heavy | comments, websocket | sonnet | `inspector/**/SessionTracker.kt` | no | Add a one-line KDoc to each public function in `SessionTracker.kt` that says why it exists, and add an inline comment explaining why the memory cache is checked before the database in `createSession`. Do not run Gradle. |
| 09-frame-batching-comments.md | comment-heavy | coroutines, room, comments | opus | `inspector/**/ChuckerScarletWebSocket.kt` | no | Add a small buffer to `logFrame` so frames arriving within 200 ms are inserted in one batch on `ioScope`. Comment the buffer only where a reader would otherwise ask why. Do not run Gradle. |
| 10-frame-repository.md | multi-file | architecture, room, compose | opus | `inspector/**/internal/data/**`, `inspector/**/SocketDetailScreen.kt` | yes | Introduce `FrameRepository` under `internal/data/` exposing `framesForSession(sessionId): Flow<List<SocketFrame>>`, and make `SocketDetailScreen` read from it instead of touching `ScarletInspector` directly. Dispatch one general-purpose subagent in the foreground to do the implementation, then review its diff. Do not run Gradle. |
| 11-suspend-create-session.md | multi-file | coroutines, websocket, gotchas | opus | `inspector/**/ChuckerScarletWebSocket.kt`, `inspector/**/SessionTracker.kt` | yes | Make `createSession` in `ChuckerScarletWebSocket` a `suspend` function, remove every `runBlocking`, and call it from `ioScope` so no Scarlet callback thread blocks. Dispatch one general-purpose subagent in the foreground to do the implementation, then review its diff. Do not run Gradle. |
| 12-viewmodel-list.md | multi-file | compose, architecture, coroutines | opus | `inspector/**/ui/**` | yes | Add `SocketListViewModel` that owns the session list state and the delete action, and hoist all state and side effects out of `SocketListScreen` into it. Dispatch one general-purpose subagent in the foreground to do the implementation, then review its diff. Do not run Gradle. |
| 13-explain-frame-path.md | info | websocket, room, architecture | sonnet | (none) | no | Explain, step by step with file names, how a text frame received by Scarlet ends up as a row in the inspector's Room table and then on screen. Change nothing. |
| 14-find-public-api.md | info | architecture | haiku | (none) | no | List the files that form the public API of the `:inspector` module and say in one line what each is for. Change nothing. |
| 15-compile-check.md | info | (none) | haiku | (none) | no | Run the fastest compile check for the inspector module and report whether it passed. Change nothing else. |

Each file's body is the prompt column verbatim; `expect_files` is the list column (empty list when `(none)`); `needs_subagent` true only for 10, 11, 12.

- [ ] **Step 2: Write the failing test**

`test/tasks-shipped.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { loadTasks } from '../src/bench/tasks.mjs';
import { loadRules } from '../src/targets/rules.mjs';
import { toolkitRoot } from '../src/client/config.mjs';

test('fifteen shipped tasks with valid labels', async () => {
  const tasks = await loadTasks(join(toolkitRoot(), 'targets', 'websocket-inspector', 'tasks'));
  const ids = new Set((await loadRules(join(toolkitRoot(), 'targets', 'websocket-inspector', 'rules'))).map((r) => r.id));
  assert.equal(tasks.length, 15);
  const counts = {};
  for (const t of tasks) {
    counts[t.category] = (counts[t.category] ?? 0) + 1;
    assert.ok(['haiku', 'sonnet', 'opus'].includes(t.gold_tier), t.id);
    for (const s of t.gold_sections) assert.ok(ids.has(s), `${t.id}: ${s}`);
    assert.ok(t.prompt.trim().length > 40, t.id);
    assert.equal(/workapp/i.test(t.prompt), false, t.id);
    if (t.needs_subagent) assert.match(t.prompt, /subagent in the foreground/);
    if (t.id !== '15-compile-check') assert.match(t.prompt, /Do not run Gradle|Change nothing/);
  }
  assert.deepEqual(counts, { 'one-file': 5, 'comment-heavy': 4, 'multi-file': 3, info: 3 });
  assert.equal(tasks.filter((t) => t.needs_subagent).length, 3);
});
```

- [ ] **Step 3: Run, write, run**

Run: `node --test test/tasks-shipped.test.mjs` → FAIL (no tasks). Write the fifteen files. Run again → 1 passing.

- [ ] **Step 4: Commit**

```bash
git add targets/websocket-inspector/tasks test/tasks-shipped.test.mjs
git commit -m "feat: fifteen benchmark tasks for the websocket-inspector target"
```

---

### Task 7: Reporter and labels

**Files:**
- Create: `src/bench/report.mjs`, `bin/jev-report.mjs`
- Test: `test/report.test.mjs`

**Interfaces:**
- Labels file: `labels/<run-id>.jsonl`, one line per record: `{ "area": "comment-policy", "arm": "jev", "task": "06-clean-decorator-comments", "rep": 1, "violations_remaining": 2 }`. `readLabels(path)` → array or `[]` when the file is missing.
- `applyLabels(records, labels)` → new records with `quality.violations_remaining` set where a label matches area/arm/task/rep.
- `summarizeRun(records)` → `{ [area]: { [arm]: ArmSummary }, excluded: [{ area, arm, task, rep, reason }] }` where failed records (`subtype !== 'success'`) and records with `cost_usd === null` are excluded from statistics but listed. `ArmSummary = { n, tasks, metrics: { input_tokens, cache_read_input_tokens, output_tokens, cost_usd, duration_ms, num_turns: { median, p90 } }, quality: { gold_sections_recall, gold_sections_precision, violations_remaining, flags_raised, orchestrator_read_full_diff, compile_pass_rate }, jev: { calls_per_task, latency_ms_median, cost_usd_total } }`. Quality values are means over records where the field is non-null (`null` when none); `orchestrator_read_full_diff` and `compile_pass_rate` are fractions of `true`.
- `median(nums)`, `p90(nums)` exported helpers (nearest-rank).
- `renderReport(manifest, summary)` → markdown: a header with run id, date, provider, models, Claude Code version, toolkit commit; then per area a table with arms as columns and rows `n`, `input tokens (median / p90)`, `cache read (median / p90)`, `output tokens (median / p90)`, `cost USD (median / p90)`, `duration s (median / p90)`, `turns (median)`, then the quality rows that are non-null for that area, then `Jev calls / task`, `Jev latency ms (median)`, `Jev cost USD (total)`; then an `Excluded` section listing each excluded record with its reason.
- `compareRuns(a, b)` → markdown with one table per area/arm present in both: rows `input tokens median`, `cost median`, `duration median`, `gold recall`, `flags raised`, columns run A, run B, delta.
- Bin: `node bin/jev-report.mjs --run-id <id> [--compare <id2>] [--labels <path>]` reads `<toolkit>/results/<id>`, applies labels from `--labels` or `labels/<id>.jsonl`, prints the report, and writes `results/<id>/report.md` (and `compare-<id2>.md` when comparing). Exit 1 when the run folder is missing.

- [ ] **Step 1: Write the failing test**

`test/report.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { median, p90, applyLabels, readLabels, summarizeRun, renderReport, compareRuns } from '../src/bench/report.mjs';

const rec = (arm, task, over = {}) => ({ run_id: 'r', area: 'dynamic-context', arm, task, rep: 1, subtype: 'success', usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 }, cost_usd: 0.01, duration_ms: 10000, num_turns: 3, quality: { compile: null, gold_sections_recall: 0.5, gold_sections_precision: 1, violations_remaining: null, flags_raised: null, orchestrator_read_full_diff: null }, jev: { calls: 1, latency_ms_total: 120, est_tokens: 800, cost_usd: 0.0000336, answers: [] }, ...over });

test('median and p90 use nearest rank', () => {
  assert.equal(median([3, 1, 2]), 2); assert.equal(median([1, 2, 3, 4]), 2.5); assert.equal(median([]), null);
  assert.equal(p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 9); assert.equal(p90([5]), 5);
});

test('labels apply by area/arm/task/rep and missing label files read as empty', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jevlab-'));
  const path = join(dir, 'r.jsonl');
  await writeFile(path, JSON.stringify({ area: 'dynamic-context', arm: 'jev', task: 'a', rep: 1, violations_remaining: 2 }) + '\n');
  const out = applyLabels([rec('jev', 'a'), rec('jev', 'b')], await readLabels(path));
  assert.equal(out[0].quality.violations_remaining, 2);
  assert.equal(out[1].quality.violations_remaining, null);
  assert.deepEqual(await readLabels(join(dir, 'missing.jsonl')), []);
});

test('summarizeRun groups by area and arm, excludes failures and unpriced records, and averages quality', () => {
  const records = [
    rec('jev', 'a'), rec('jev', 'b', { usage: { input_tokens: 3000, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, cost_usd: 0.03, jev: { calls: 3, latency_ms_total: 300, est_tokens: 100, cost_usd: 0.0000042, answers: [] } }),
    rec('full', 'a', { quality: { gold_sections_recall: 1, gold_sections_precision: 0.2 }, jev: { calls: 0, latency_ms_total: 0, est_tokens: 0, cost_usd: 0, answers: [] } }),
    rec('full', 'b', { subtype: 'failed', error: 'claude exit 1' }),
    rec('native', 'a', { cost_usd: null }),
  ];
  const s = summarizeRun(records);
  assert.equal(s['dynamic-context'].jev.n, 2);
  assert.equal(s['dynamic-context'].jev.metrics.input_tokens.median, 2000);
  assert.equal(s['dynamic-context'].jev.metrics.cost_usd.p90, 0.03);
  assert.equal(s['dynamic-context'].jev.quality.gold_sections_recall, 0.5);
  assert.equal(s['dynamic-context'].jev.jev.calls_per_task, 2);
  assert.equal(s['dynamic-context'].jev.jev.latency_ms_median, 110);
  assert.equal(s['dynamic-context'].full.n, 1);
  assert.equal(s['dynamic-context'].full.quality.gold_sections_precision, 0.2);
  assert.equal(s['dynamic-context'].native, undefined);
  assert.deepEqual(s.excluded.map((e) => [e.arm, e.task, e.reason]), [['full', 'b', 'claude exit 1'], ['native', 'a', 'cost_usd null']]);
});

test('renderReport and compareRuns produce markdown with the expected rows', () => {
  const manifest = { run_id: 'r', date: '2026-09-28T10:00:00Z', provider: 'deepseek', models: { opus: 'x', sonnet: 'y', haiku: 'y', subagent: 'y' }, claude_code_version: '2.1.278', toolkit_commit: 'abc' };
  const s = summarizeRun([rec('jev', 'a'), rec('full', 'a')]);
  const md = renderReport(manifest, s);
  assert.match(md, /^# JEV benchmark run r/m);
  assert.match(md, /\| metric \| full \| jev \|/);
  assert.match(md, /input tokens \(median \/ p90\)/);
  assert.match(md, /gold sections recall/);
  assert.match(md, /Jev calls \/ task/);
  assert.match(md, /## Excluded/);
  const cmp = compareRuns({ manifest, summary: s }, { manifest: { ...manifest, run_id: 'r2' }, summary: summarizeRun([rec('jev', 'a', { cost_usd: 0.02 })]) });
  assert.match(cmp, /dynamic-context \/ jev/);
  assert.match(cmp, /cost median \| 0\.0100 \| 0\.0200 \| \+0\.0100/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/report.test.mjs` → FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`src/bench/report.mjs`:
```js
import { readFile } from 'node:fs/promises';

const sortNums = (xs) => xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
export function median(nums) { const s = sortNums(nums); if (!s.length) return null; const m = s.length / 2; return s.length % 2 ? s[Math.floor(m)] : (s[m - 1] + s[m]) / 2; }
export function p90(nums) { const s = sortNums(nums); if (!s.length) return null; return s[Math.max(0, Math.ceil(0.9 * s.length) - 1)]; }
const mean = (nums) => { const s = sortNums(nums); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; };
const rate = (vals) => { const b = vals.filter((v) => typeof v === 'boolean'); return b.length ? b.filter(Boolean).length / b.length : null; };

export async function readLabels(path) {
  try { return (await readFile(path, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}

export function applyLabels(records, labels) {
  return records.map((r) => {
    const l = labels.find((x) => x.area === r.area && x.arm === r.arm && x.task === r.task && x.rep === r.rep);
    return l ? { ...r, quality: { ...r.quality, violations_remaining: l.violations_remaining } } : r;
  });
}

const METRICS = { input_tokens: (r) => r.usage?.input_tokens, cache_read_input_tokens: (r) => r.usage?.cache_read_input_tokens, output_tokens: (r) => r.usage?.output_tokens, cost_usd: (r) => r.cost_usd, duration_ms: (r) => r.duration_ms, num_turns: (r) => r.num_turns };
const QUALITY = ['gold_sections_recall', 'gold_sections_precision', 'violations_remaining', 'flags_raised'];

function armSummary(rs) {
  const metrics = Object.fromEntries(Object.entries(METRICS).map(([k, f]) => [k, { median: median(rs.map(f)), p90: p90(rs.map(f)) }]));
  const quality = Object.fromEntries(QUALITY.map((q) => [q, mean(rs.map((r) => r.quality?.[q]))]));
  quality.orchestrator_read_full_diff = rate(rs.map((r) => r.quality?.orchestrator_read_full_diff));
  quality.compile_pass_rate = rate(rs.map((r) => r.quality?.compile));
  const jev = { calls_per_task: mean(rs.map((r) => r.jev?.calls ?? 0)), latency_ms_median: median(rs.flatMap((r) => (r.jev?.calls ? [r.jev.latency_ms_total / r.jev.calls] : []))), cost_usd_total: rs.reduce((a, r) => a + (r.jev?.cost_usd ?? 0), 0) };
  return { n: rs.length, tasks: [...new Set(rs.map((r) => r.task))], metrics, quality, jev };
}

export function summarizeRun(records) {
  const out = { excluded: [] };
  const groups = {};
  for (const r of records) {
    if (r.subtype !== 'success') { out.excluded.push({ area: r.area, arm: r.arm, task: r.task, rep: r.rep, reason: r.error ?? r.subtype ?? 'not success' }); continue; }
    if (r.cost_usd === null || r.cost_usd === undefined) { out.excluded.push({ area: r.area, arm: r.arm, task: r.task, rep: r.rep, reason: 'cost_usd null' }); continue; }
    ((groups[r.area] ??= {})[r.arm] ??= []).push(r);
  }
  for (const [area, arms] of Object.entries(groups)) out[area] = Object.fromEntries(Object.entries(arms).map(([arm, rs]) => [arm, armSummary(rs)]));
  return out;
}

const fmt = (v, d = 0) => (v === null || v === undefined ? 'n/a' : typeof v === 'number' ? v.toFixed(d) : String(v));
const pair = (m, d = 0) => `${fmt(m.median, d)} / ${fmt(m.p90, d)}`;
const LABELS = { gold_sections_recall: 'gold sections recall', gold_sections_precision: 'gold sections precision', violations_remaining: 'violations remaining (mean)', flags_raised: 'flags raised (mean)', orchestrator_read_full_diff: 'read full diff (rate)', compile_pass_rate: 'compile pass rate' };

export function renderReport(manifest, summary) {
  const lines = [`# JEV benchmark run ${manifest.run_id}`, '', `date ${manifest.date} · provider ${manifest.provider} · models ${JSON.stringify(manifest.models)} · Claude Code ${manifest.claude_code_version} · toolkit ${manifest.toolkit_commit}`, ''];
  for (const [area, arms] of Object.entries(summary)) {
    if (area === 'excluded') continue;
    const names = Object.keys(arms).sort();
    lines.push(`## ${area}`, '', `| metric | ${names.join(' | ')} |`, `|---|${names.map(() => '---').join('|')}|`);
    const row = (label, f) => lines.push(`| ${label} | ${names.map((n) => f(arms[n])).join(' | ')} |`);
    row('n', (a) => String(a.n));
    row('input tokens (median / p90)', (a) => pair(a.metrics.input_tokens));
    row('cache read (median / p90)', (a) => pair(a.metrics.cache_read_input_tokens));
    row('output tokens (median / p90)', (a) => pair(a.metrics.output_tokens));
    row('cost USD (median / p90)', (a) => pair(a.metrics.cost_usd, 4));
    row('duration s (median / p90)', (a) => `${fmt(a.metrics.duration_ms.median / 1000, 1)} / ${fmt(a.metrics.duration_ms.p90 / 1000, 1)}`);
    row('turns (median)', (a) => fmt(a.metrics.num_turns.median, 1));
    for (const [q, label] of Object.entries(LABELS)) if (names.some((n) => arms[n].quality[q] !== null)) row(label, (a) => fmt(a.quality[q], 2));
    row('Jev calls / task', (a) => fmt(a.jev.calls_per_task, 2));
    row('Jev latency ms (median)', (a) => fmt(a.jev.latency_ms_median, 0));
    row('Jev cost USD (total)', (a) => fmt(a.jev.cost_usd_total, 6));
    lines.push('');
  }
  lines.push('## Excluded', '');
  if (!summary.excluded.length) lines.push('none');
  for (const e of summary.excluded) lines.push(`- ${e.area}/${e.arm} ${e.task} r${e.rep}: ${e.reason}`);
  return lines.join('\n') + '\n';
}

export function compareRuns(a, b) {
  const lines = [`# Compare ${a.manifest.run_id} vs ${b.manifest.run_id}`, ''];
  const delta = (x, y, d) => (x === null || y === null ? 'n/a' : `${y - x >= 0 ? '+' : ''}${(y - x).toFixed(d)}`);
  for (const area of Object.keys(a.summary).filter((k) => k !== 'excluded' && b.summary[k])) {
    for (const arm of Object.keys(a.summary[area]).filter((k) => b.summary[area][k])) {
      const x = a.summary[area][arm]; const y = b.summary[area][arm];
      lines.push(`## ${area} / ${arm}`, '', `| metric | ${a.manifest.run_id} | ${b.manifest.run_id} | delta |`, '|---|---|---|---|');
      const row = (label, gx, gy, d) => lines.push(`| ${label} | ${fmt(gx, d)} | ${fmt(gy, d)} | ${delta(gx, gy, d)} |`);
      row('input tokens median', x.metrics.input_tokens.median, y.metrics.input_tokens.median, 0);
      row('cost median', x.metrics.cost_usd.median, y.metrics.cost_usd.median, 4);
      row('duration median', x.metrics.duration_ms.median, y.metrics.duration_ms.median, 0);
      row('gold recall', x.quality.gold_sections_recall, y.quality.gold_sections_recall, 2);
      row('flags raised', x.quality.flags_raised, y.quality.flags_raised, 2);
      lines.push('');
    }
  }
  return lines.join('\n') + '\n';
}
```

`bin/jev-report.mjs`:
```js
#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { toolkitRoot } from '../src/client/config.mjs';
import { readRun } from '../src/bench/results.mjs';
import { readLabels, applyLabels, summarizeRun, renderReport, compareRuns } from '../src/bench/report.mjs';

async function main() {
  let values;
  try { ({ values } = parseArgs({ options: { 'run-id': { type: 'string' }, compare: { type: 'string' }, labels: { type: 'string' } } })); } catch (e) { console.error(`usage error: ${e.message}`); return 1; }
  if (!values['run-id']) { console.error('usage: jev-report --run-id <id> [--compare <id2>] [--labels <path>]'); return 1; }
  const resultsDir = join(toolkitRoot(), 'results');
  const load = async (id) => {
    const run = await readRun(resultsDir, id);
    const labels = await readLabels(values.labels ?? join(toolkitRoot(), 'labels', `${id}.jsonl`));
    return { manifest: run.manifest, summary: summarizeRun(applyLabels(run.records, labels)) };
  };
  try {
    const a = await load(values['run-id']);
    const md = renderReport(a.manifest, a.summary);
    process.stdout.write(md);
    await writeFile(join(resultsDir, values['run-id'], 'report.md'), md);
    if (values.compare) {
      const b = await load(values.compare);
      const cmp = compareRuns(a, b);
      process.stdout.write(cmp);
      await writeFile(join(resultsDir, values['run-id'], `compare-${values.compare}.md`), cmp);
    }
    return 0;
  } catch (e) { console.error(`report failed: ${e.message}`); return 1; }
}

process.exitCode = await main();
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/report.test.mjs` → 4 passing.

- [ ] **Step 5: Commit**

```bash
chmod +x bin/jev-report.mjs
git add src/bench/report.mjs bin/jev-report.mjs test/report.test.mjs
git commit -m "feat: benchmark reporter with labels and run comparison"
```

---

### Task 8: First-contact hook check

**Files:**
- Create: `src/bench/hooks-check.mjs`, `bin/jev-hooks-check.mjs`
- Test: `test/hooks-check.test.mjs`

**Interfaces:**
- `PROBES` = three prompts run in order under the `all-jev` arm:
  1. `context`: `Reply with the single word READY and use no tools.`
  2. `comment`: `Create the file src/JevProbe.kt with exactly these two lines and nothing else:\n// increment counter\nval counter = 0\nThen stop.`
  3. `agent`: `Use the Agent tool once, in the foreground, with subagent_type general-purpose and this prompt: "Count the Kotlin files under this directory and reply with the number." Then reply with the number it returned.`
- `assessProbes({ logDir, sessions: { context, comment, agent }, cardsBefore })` → `{ checks: [{ name, ok, detail }] }` with checks:
  - `dynamic-context hook fired`: a line in `<logDir>/dynamic-context.jsonl` with `sessionId === sessions.context` (any `ok` value; a `skipped` event counts as fired but is reported in `detail`).
  - `dynamic-context Jev call ok`: such a line with `ok === true`.
  - `comment-policy hook fired`: a line in `comment-policy.jsonl` with `sessionId === sessions.comment`.
  - `comment-policy Jev call ok`: with `ok === true`.
  - `hand-back card produced`: a new `.card.md` under `<logDir>/handback` since `cardsBefore`.
  - `hand-back card has facts`: that card's `Facts:` line contains `attribution snapshot`.
- `checkHooks({ targetDir, config, provider, env, spawnImpl, runGitImpl, log })` → `{ checks, sessions }`: asserts the target, resets, installs `all-jev`, verifies, then for each probe runs `runClaude` (maxTurns 6, `ALLOWED_TOOLS`) and records `extractResult(...).session_id`; resets the target at the end; returns `assessProbes(...)`. Throws on refusal.
- Bin: `node bin/jev-hooks-check.mjs --target <dir> [--provider name] --yes-reset` prints one line per check `PASS <name>` / `FAIL <name>: <detail>` and exits 0 when all pass, 2 otherwise, 3 on refusal.

- [ ] **Step 1: Write the failing test**

`test/hooks-check.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assessProbes, PROBES } from '../src/bench/hooks-check.mjs';

test('three probes, in order, with the agent probe demanding a foreground subagent', () => {
  assert.deepEqual(PROBES.map((p) => p.name), ['context', 'comment', 'agent']);
  assert.match(PROBES[2].prompt, /in the foreground/);
});

test('assessProbes reports each hook from the logs and cards', async () => {
  const logDir = await mkdtemp(join(tmpdir(), 'jevhc-'));
  await mkdir(join(logDir, 'handback'), { recursive: true });
  await writeFile(join(logDir, 'dynamic-context.jsonl'), JSON.stringify({ sessionId: 's1', ok: true }) + '\n');
  await writeFile(join(logDir, 'comment-policy.jsonl'), JSON.stringify({ sessionId: 's2', ok: false, reason: 'no_api_key' }) + '\n');
  await writeFile(join(logDir, 'handback', 'tu9.card.md'), 'JEV hand-back check (general-purpose, m)\nFlags: none\nFacts: files changed 0, test files changed no, +0/-0, untracked 0, attribution snapshot\n');
  const { checks } = await assessProbes({ logDir, sessions: { context: 's1', comment: 's2', agent: 's3' }, cardsBefore: new Set() });
  const byName = Object.fromEntries(checks.map((c) => [c.name, c]));
  assert.equal(byName['dynamic-context hook fired'].ok, true);
  assert.equal(byName['dynamic-context Jev call ok'].ok, true);
  assert.equal(byName['comment-policy hook fired'].ok, true);
  assert.equal(byName['comment-policy Jev call ok'].ok, false);
  assert.match(byName['comment-policy Jev call ok'].detail, /no_api_key/);
  assert.equal(byName['hand-back card produced'].ok, true);
  assert.equal(byName['hand-back card has facts'].ok, true);
  const none = await assessProbes({ logDir, sessions: { context: 'x', comment: 'y', agent: 'z' }, cardsBefore: new Set(['tu9.card.md']) });
  assert.ok(none.checks.every((c) => c.ok === false));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/hooks-check.test.mjs` → FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`src/bench/hooks-check.mjs`:
```js
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { toolkitRoot } from '../client/config.mjs';
import { installArm, verifyInstall } from '../targets/install.mjs';
import { armEnv } from './providers.mjs';
import { runClaude, parseStream, extractResult } from './claude-run.mjs';
import { assertTarget, resetTarget } from './target.mjs';
import { listCards } from './quality.mjs';
import { ALLOWED_TOOLS } from './runner.mjs';

export const PROBES = [
  { name: 'context', prompt: 'Reply with the single word READY and use no tools.' },
  { name: 'comment', prompt: 'Create the file src/JevProbe.kt with exactly these two lines and nothing else:\n// increment counter\nval counter = 0\nThen stop.' },
  { name: 'agent', prompt: 'Use the Agent tool once, in the foreground, with subagent_type general-purpose and this prompt: "Count the Kotlin files under this directory and reply with the number." Then reply with the number it returned.' },
];

async function linesFor(logDir, area, sessionId) {
  try {
    return (await readFile(join(logDir, `${area}.jsonl`), 'utf8')).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((e) => e && e.sessionId === sessionId);
  } catch { return []; }
}

export async function assessProbes({ logDir, sessions, cardsBefore }) {
  const checks = [];
  for (const [area, key] of [['dynamic-context', 'context'], ['comment-policy', 'comment']]) {
    const lines = await linesFor(logDir, area, sessions[key]);
    checks.push({ name: `${area} hook fired`, ok: lines.length > 0, detail: lines.length ? `${lines.length} line(s)${lines.some((l) => l.event === 'skipped') ? ', includes skipped' : ''}` : `no line with sessionId ${sessions[key]}` });
    const okLine = lines.find((l) => l.ok === true);
    checks.push({ name: `${area} Jev call ok`, ok: Boolean(okLine), detail: okLine ? 'ok' : (lines.map((l) => l.reason).filter(Boolean).join(', ') || 'no call') });
  }
  const cardsDir = join(logDir, 'handback');
  const fresh = [...(await listCards(cardsDir))].filter((f) => !cardsBefore.has(f));
  checks.push({ name: 'hand-back card produced', ok: fresh.length > 0, detail: fresh.length ? fresh.join(', ') : 'no new card' });
  let facts = false; let detail = 'no card';
  if (fresh.length) { const text = await readFile(join(cardsDir, fresh[0]), 'utf8'); const line = text.split('\n').find((l) => l.startsWith('Facts:')) ?? ''; facts = /attribution snapshot/.test(line); detail = line || 'no Facts line'; }
  checks.push({ name: 'hand-back card has facts', ok: facts, detail });
  return { checks };
}

/** Installs all-jev, runs three tiny sessions, and reports whether each hook actually fired against the real API. */
export async function checkHooks({ targetDir, config, provider, env, spawnImpl = nodeSpawn, runGitImpl, log = () => {} }) {
  assertTarget({ targetDir, allowedRoots: config.allowedRoots, runGitImpl });
  const base = join(toolkitRoot(), 'targets', 'websocket-inspector');
  const args = { targetDir, armFile: join(base, 'arms', 'all-jev.json'), rulesDir: join(base, 'rules'), toolkitPath: toolkitRoot() };
  const runEnv = { ...process.env, ...env, ...armEnv({ provider, env, runId: 'hooks-check', logDir: config.logDir }) };
  resetTarget({ targetDir, runGitImpl });
  await installArm(args);
  const v = await verifyInstall(args);
  if (!v.ok) throw new Error(`install drift: ${v.problems.join('; ')}`);
  const cardsBefore = await listCards(join(config.logDir, 'handback'));
  const sessions = {};
  try {
    for (const probe of PROBES) {
      log(`probe ${probe.name}`);
      const run = await runClaude({ cwd: targetDir, prompt: probe.prompt, model: provider.models.sonnet, maxTurns: 6, allowedTools: ALLOWED_TOOLS, env: runEnv, spawnImpl, timeoutMs: 5 * 60 * 1000 });
      sessions[probe.name] = extractResult(parseStream(run.stdout).result).session_id;
    }
  } finally {
    resetTarget({ targetDir, runGitImpl });
  }
  return { ...(await assessProbes({ logDir: config.logDir, sessions, cardsBefore })), sessions };
}
```

`bin/jev-hooks-check.mjs`:
```js
#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { loadConfig } from '../src/client/config.mjs';
import { resolveProvider } from '../src/bench/providers.mjs';
import { checkHooks } from '../src/bench/hooks-check.mjs';

async function main() {
  let values;
  try { ({ values } = parseArgs({ options: { target: { type: 'string' }, provider: { type: 'string' }, 'yes-reset': { type: 'boolean', default: false } } })); } catch (e) { console.error(`usage error: ${e.message}`); return 1; }
  if (!values.target) { console.error('usage: jev-hooks-check --target <dir> [--provider name] --yes-reset'); return 1; }
  if (!values['yes-reset']) { console.error('This resets the target to jev-baseline before and after the probes. Re-run with --yes-reset.'); return 1; }
  try {
    const config = loadConfig();
    if (config.configMissing) throw new Error('jev.config.json is missing');
    const { checks } = await checkHooks({ targetDir: resolve(values.target), config, provider: resolveProvider(config, values.provider), env: process.env, log: (m) => console.log(m) });
    for (const c of checks) console.log(c.ok ? `PASS ${c.name}` : `FAIL ${c.name}: ${c.detail}`);
    return checks.every((c) => c.ok) ? 0 : 2;
  } catch (e) { console.error(`refused: ${e.message}`); return 3; }
}

process.exitCode = await main();
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/hooks-check.test.mjs` → 2 passing.

- [ ] **Step 5: Commit**

```bash
chmod +x bin/jev-hooks-check.mjs
git add src/bench/hooks-check.mjs bin/jev-hooks-check.mjs test/hooks-check.test.mjs
git commit -m "feat: first-contact hook check"
```

---

### Task 9: Runbook, README, gitignore, spec pointer, full suite

**Files:**
- Create: `RUNBOOK.md`
- Modify: `README.md`, `.gitignore`, `docs/superpowers/specs/2026-09-21-jev-toolkit-design.md` (section 12 note)

- [ ] **Step 1: `.gitignore`**

Replace the `results/` and `labels/` lines with:
```
results/**/*.claude.jsonl
```
so result JSON, diffs, reports, and label files are committed from the personal device while raw transcripts stay local.

- [ ] **Step 2: Write `RUNBOOK.md`**

```markdown
# JEV benchmark runbook

For the personal device. Assumes no context beyond this file. Every command runs from the
`jev-toolkit` checkout unless stated. Paths in angle brackets are yours to fill.

## 0. What this measures

Claude Code runs a fixed set of tasks on the WebSocket Inspector, once per "arm". Arms differ in
one thing: whether a Jev hook is in the loop. Results are token usage, cost, duration, and a few
quality signals per task, written under `results/<run-id>/`.

Areas and arms:

| area | arms | what differs |
|---|---|---|
| dynamic-context | full, jev, native | how project rules reach the model |
| comment-policy | none, llm, jev | who judges narration comments on every edit |
| handback | always, jev | whether the parent reads the full diff after every subagent |

The model router is measured offline with `jev-accuracy` (no sessions).

## 1. Prerequisites

- Node 20 or newer (`node --version`).
- Claude Code CLI 2.1 or newer (`claude --version`).
- `git`, and the GitHub CLI logged in (`gh auth status`).
- API keys: TypeSafe (`TYPESAFE_API_KEY`), and DeepSeek (`DEEPSEEK_API_KEY`) or Qwen.
- Disk: a few hundred MB for raw transcripts.

## 2. Clone and configure

    git clone https://github.com/TimurHaryo/jev-toolkit.git
    git clone https://github.com/TimurHaryo/websocket-inspector.git
    cd jev-toolkit
    cp jev.config.example.json jev.config.json

Edit `jev.config.json`:

- `allowedRoots`: the absolute path of the `websocket-inspector` clone (spaces are fine).
- `logDir`: leave as `logs` (inside the toolkit). Never point it inside the target.
- `providers.deepseek.pricing`: update the four prices per model from the provider's price page today.
- `activeProvider`: `deepseek` (or add a `qwen` block with the same shape).

Export keys in the shell you will use:

    export TYPESAFE_API_KEY=...
    export DEEPSEEK_API_KEY=...

Confirm the target has its baseline tag:

    git -C "<websocket-inspector path>" tag        # must print jev-baseline

## 3. First contact with Jev

    node bin/jev-smoke.mjs

PASS prints the raw answers, the resolved `mode`, and `allowedRoots`. FAIL prints a block headed
`PASTE THIS BACK`; send that block to the maintainer before going further.

## 4. Record fixtures and measure Jev accuracy (no sessions)

    node bin/jev-accuracy.mjs --area comment-policy --mode record
    node bin/jev-accuracy.mjs --area dynamic-context --mode record
    node bin/jev-accuracy.mjs --area handback-check --mode record
    node bin/jev-accuracy.mjs --area model-router --mode record

Each prints agreement, per-question precision and recall, and calibration buckets. Then the LLM
comparison for the two areas where it matters:

    node bin/jev-accuracy.mjs --area comment-policy --judge llm
    node bin/jev-accuracy.mjs --area model-router --judge llm

Commit the recordings so replays work everywhere:

    git add fixtures/recordings && git commit -m "chore: record Jev responses" && git push

## 5. First contact with the hooks

This resets the target to `jev-baseline` (discarding any local edits there), installs every hook,
runs three tiny sessions, and resets again:

    node bin/jev-hooks-check.mjs --target "<websocket-inspector path>" --yes-reset

Expect six `PASS` lines. Any `FAIL` means a hook contract differs on this machine; paste the
output back before running the benchmark.

## 6. Run the benchmark

Start with one repetition to prove the pipeline, then three for medians. Each command resets the
target before every task. `<id>` is a run id you choose, for example `2026-10-01-deepseek-a`.

    T="<websocket-inspector path>"
    node bin/jev-bench.mjs --area dynamic-context --arm full   --target "$T" --run-id <id> --reps 1 --yes-reset
    node bin/jev-bench.mjs --area dynamic-context --arm jev    --target "$T" --run-id <id> --reps 1 --yes-reset
    node bin/jev-bench.mjs --area dynamic-context --arm native --target "$T" --run-id <id> --reps 1 --yes-reset
    node bin/jev-bench.mjs --area comment-policy  --arm none   --target "$T" --run-id <id> --reps 1 --yes-reset
    node bin/jev-bench.mjs --area comment-policy  --arm llm    --target "$T" --run-id <id> --reps 1 --yes-reset
    node bin/jev-bench.mjs --area comment-policy  --arm jev    --target "$T" --run-id <id> --reps 1 --yes-reset
    node bin/jev-bench.mjs --area handback        --arm always --target "$T" --run-id <id> --reps 1 --yes-reset
    node bin/jev-bench.mjs --area handback        --arm jev    --target "$T" --run-id <id> --reps 1 --yes-reset

`--tasks 01-theme-color,13-explain-frame-path` limits a run; `--compile` adds a Gradle compile check
per task (needs the Android SDK; slow). Exit code 2 means some tasks failed but results were
written; the report lists them under Excluded.

When one repetition looks sane, repeat the eight commands with `--reps 3` and a new `<id>`.

## 7. Hand-label comment violations

For every comment-policy result, open `results/<id>/comment-policy/<arm>/<task>-r<rep>.diff`,
count comments in the diff that narrate the code or restate a signature, and append one line per
result to `labels/<id>.jsonl`:

    {"area":"comment-policy","arm":"jev","task":"06-clean-decorator-comments","rep":1,"violations_remaining":2}

## 8. Report and send back

    node bin/jev-report.mjs --run-id <id>
    git add results/<id> labels && git commit -m "results: <id>" && git push

The report is also written to `results/<id>/report.md`. Raw transcripts (`*.claude.jsonl`) stay
local by design.

## 9. Optional: Claude calibration sample

Run five tasks once on native Anthropic to check the DeepSeek numbers point the same way:

    export ANTHROPIC_API_KEY=...
    node bin/jev-bench.mjs --area dynamic-context --arm jev --target "$T" --run-id <id>-claude --provider anthropic --tasks 01-theme-color,04-cancel-scope,06-clean-decorator-comments,10-frame-repository,13-explain-frame-path --reps 1 --yes-reset
    node bin/jev-report.mjs --run-id <id> --compare <id>-claude

## 10. If something goes wrong

- `refused: ... allowedRoots`: fix the path in `jev.config.json`.
- `refused: tag jev-baseline is missing`: `git -C "$T" fetch --tags`.
- `install drift`: the target's `CLAUDE.md` or `.claude/` was edited by hand; delete them and rerun.
- `claude timed out`: the task hung; rerun that task with `--tasks <id>`.
- `cost_usd null` in the report: add the model's prices to `jev.config.json` and rerun the report.
- Hooks silently not firing: `node bin/jev-hooks-check.mjs` again, then check `logs/*.jsonl` for `skipped` lines and their `reason`.
- Everything Jev-related can be switched off with `JEV_DISABLE=1` in the environment.
```

- [ ] **Step 3: README and spec**

README `Status`: add `Plan 3 done: providers and pricing, LLM judge arm, benchmark runner, reporter, first-contact hook check, RUNBOOK.md.` Add a section `## Benchmark` with two lines: "See RUNBOOK.md. Results are committed per run under results/<run-id>/; raw transcripts stay local." Update the Layout block: `src/bench       providers, pricing, LLM judge, headless runner, results, quality, report, hooks check` and `targets/.../tasks  benchmark task prompts with gold labels`.

Spec section 12: replace its numbered list header line with "The runbook is `RUNBOOK.md` at the repo root (plan 3); the list below is its outline." and leave the list.

- [ ] **Step 4: Full suite and hygiene**

Run: `node --test` → all passing, pristine. `test ! -d node_modules && node -e "const p=require('./package.json'); if(p.dependencies||p.devDependencies) process.exit(1)" && echo clean`. `grep -ri workapp targets fixtures skills src bin RUNBOOK.md | wc -l` → 0.

- [ ] **Step 5: Commit**

```bash
git add RUNBOOK.md README.md .gitignore docs/superpowers/specs/2026-09-21-jev-toolkit-design.md
git commit -m "docs: runbook, README, results tracking for plan 3"
```

---

## Self-review against the spec

- **§10.1 arms:** dynamic-context full/jev/native (plan 2 arms), comment-policy none/llm/jev (T2 adds none and llm), handback always/jev (T3), model-router offline via `jev-accuracy --judge` (T2). Orchestrator instructions per hand-back arm via `orchestratorNote` (T3).
- **§10.2 runner:** reset to `jev-baseline`, install per arm, verified, headless stream-json run from the target with the arm environment, raw output and diff saved, optional compile, manifest fields (T4, T5).
- **§10.3 result file:** all fields present; `expect_files_hit` is recorded as `null` because glob matching against the diff was not required by any consumer yet (documented deviation, spec column stays for a later pass).
- **§10.4 quality:** gold section recall/precision from the hook's own state file, `violations_remaining` from hand labels, `flags_raised` from cards, `orchestrator_read_full_diff` from the transcript, compile flag (T4, T5, T7).
- **§10.5 reporter:** per-area tables with median and p90, quality rows, Jev rows, excluded section, `--compare` (T7).
- **§11 portability:** providers and pricing in config, token from a named env var, results committed while raw transcripts are ignored (T1, T9).
- **§12 runbook:** all ten outline items covered, plus the hook first-contact step the plan 2 review demanded (T8, T9).
- **Carry-forwards from plan 2:** `logDir` outside the target (runbook and manifest), foreground subagents (task prompts and probes), post-install verification (T3, T5), live hook check (T8). Chunk concurrency cap in the comment hook is not in this plan; it stays a deferred item.
- **Type consistency:** `armEnv` output keys are what `runClaude` receives; `extractResult` shape feeds `costFromModelUsage` and the result record; `listCards`/`handbackSignals` share the card naming from plan 2; `loadTasks` fields match the runner's use and the shipped-task test; `summarizeRun` reads exactly the record fields the runner writes.
- **Placeholder scan:** none.
