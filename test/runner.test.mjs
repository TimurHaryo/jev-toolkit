import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runBenchmark, ALLOWED_TOOLS } from '../src/bench/runner.mjs';
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

function fakeClaude(streamText, { edit, onRun, code = 0 } = {}) {
  return (cmd, args, opts) => {
    fakeClaude.calls.push({ cmd, args, opts });
    const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => {};
    setTimeout(async () => {
      if (edit) await writeFile(join(opts.cwd, 'src', 'A.kt'), 'class A { val x = 1 }\n');
      if (onRun) await onRun(opts);
      p.stdout.emit('data', Buffer.from(streamText)); p.emit('close', code);
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
  assert.deepEqual(manifest.question_versions, { 'comment-policy': '1', 'dynamic-context': '1', 'handback-check': '1', 'model-router': '1' });
  assert.equal(rec.diff.expect_files_hit, null);
  assert.equal(rec.jev.ok_calls, 1);
  assert.deepEqual(rec.jev.reasons, {});
  assert.ok((await readFile(rec.raw_result_path, 'utf8')).includes('"type":"result"'));
  assert.match(await readFile(rec.diff_path, 'utf8'), /val x = 1/);
  const files = await readdir(join(s.tgt, 'src'));
  assert.equal(files.includes('Dirty.kt'), false);
  const call = fakeClaude.calls[0];
  assert.equal(call.opts.cwd, s.tgt);
  assert.equal(call.opts.env.ANTHROPIC_AUTH_TOKEN, 'tok');
  assert.equal(call.opts.env.JEV_RUN_ID, 'run1');
  assert.equal(call.opts.env.CLAUDE_CONFIG_DIR, join(toolkitRoot(), '.claude-config'));
  assert.equal('CLAUDECODE' in call.opts.env, false);
  assert.equal(call.args[call.args.indexOf('--allowedTools') + 1], ALLOWED_TOOLS);
  assert.ok(call.args.includes('deepseek-reasoner'));
  assert.match(await readFile(join(s.tgt, 'CLAUDE.md'), 'utf8'), /injected per task by the JEV dynamic-context hook/);
});

test('handback area runs only subagent tasks and fills its quality fields; a failing claude run is recorded and reported', async () => {
  const s = await setup();
  await writeFile(join(s.tasksDir, '02-info.md'), '---\nid: 02-info\ncategory: info\ngold_sections: []\ngold_tier: haiku\nexpect_files: []\nneeds_subagent: false\n---\nExplain.\n');
  await mkdir(join(s.logDir, 'handback'), { recursive: true });
  const spawnImpl = fakeClaude(s.stream, { onRun: () => writeFile(join(s.logDir, 'handback', 'tu1.card.md'), 'JEV hand-back check (general-purpose, deepseek-chat)\nFlags: claims tests added; no test files changed\n') });
  const r = await runBenchmark(base(s, { area: 'handback', arm: 'jev', spawnImpl }));
  assert.equal(r.written.length, 1);
  const rec = JSON.parse(await readFile(r.written[0], 'utf8'));
  assert.equal(rec.task, '01-a');
  assert.equal(rec.quality.flags_raised, 1);
  assert.equal(rec.quality.orchestrator_read_full_diff, true);
  const failing = (cmd, args, opts) => { const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => {}; setTimeout(() => p.emit('close', 1), 0); return p; };
  const f = await runBenchmark(base(s, { area: 'comment-policy', arm: 'none', runId: 'run2', taskIds: ['01-a'], spawnImpl: failing }));
  assert.equal(f.failures.length, 1);
  assert.match(f.failures[0].error, /exit 1/);
  const failed = JSON.parse(await readFile(f.written[0], 'utf8'));
  assert.equal(failed.subtype, 'failed');
  assert.equal(failed.usage, undefined);
  assert.equal(failed.cost_usd, undefined);
});

test('refusals: no --yes-reset, target outside roots, missing token', async () => {
  const s = await setup();
  await assert.rejects(runBenchmark(base(s, { yesReset: false })), /--yes-reset/);
  await assert.rejects(runBenchmark(base(s, { config: { ...s.config, allowedRoots: ['/elsewhere'] } })), /allowedRoots/);
  await assert.rejects(runBenchmark(base(s, { env: {} })), /DEEPSEEK_API_KEY/);
});

test('onChild receives the spawned claude process so a signal handler can kill it', async () => {
  const s = await setup();
  fakeClaude.calls = [];
  const spawnImpl = fakeClaude(s.stream);
  const seen = [];
  const r = await runBenchmark(base(s, { spawnImpl, onChild: (c) => seen.push(c) }));
  assert.deepEqual(r.failures, []);
  assert.equal(seen.length, 1);
  assert.ok(seen[0] instanceof EventEmitter);
});

test('native Anthropic runs never inherit a base URL from the caller environment', async () => {
  const s = await setup();
  const native = { ...provider, name: 'anthropic', baseUrl: null, authTokenEnv: 'ANTHROPIC_API_KEY', authHeader: 'x-api-key' };
  fakeClaude.calls = [];
  const r = await runBenchmark(base(s, { provider: native, spawnImpl: fakeClaude(s.stream), env: { ANTHROPIC_BASE_URL: 'https://leak', ANTHROPIC_API_KEY: 'k', ANTHROPIC_AUTH_TOKEN: 'stale', PATH: process.env.PATH } }));
  assert.deepEqual(r.failures, []);
  const call = fakeClaude.calls[0];
  assert.equal(Object.hasOwn(call.opts.env, 'ANTHROPIC_BASE_URL'), false);
  assert.equal(call.opts.env.ANTHROPIC_API_KEY, 'k');
  assert.equal(Object.hasOwn(call.opts.env, 'ANTHROPIC_AUTH_TOKEN'), false);
});

test('the llm arm counts judge lines and prices their usage', async () => {
  const s = await setup();
  await mkdir(s.logDir, { recursive: true });
  await writeFile(join(s.logDir, 'comment-policy-llm.jsonl'), JSON.stringify({ area: 'comment-policy', model: 'deepseek-chat', sessionId: 'sess-1', ok: true, latencyMs: 900, usage: { input_tokens: 2000, output_tokens: 100 } }) + '\n');
  const r = await runBenchmark(base(s, { area: 'comment-policy', arm: 'llm', spawnImpl: fakeClaude(s.stream) }));
  assert.deepEqual(r.failures, []);
  const rec = JSON.parse(await readFile(r.written[0], 'utf8'));
  assert.equal(rec.jev.calls, 1);
  assert.equal(rec.jev.est_tokens, 0);
  assert.equal(rec.jev.judge_usage['deepseek-chat'].input_tokens, 2000);
  assert.equal(rec.jev.cost_usd.toFixed(8), (2000 / 1e6 * 1 + 100 / 1e6 * 2).toFixed(8));
});

test('side-channel lines are split into ok calls and a failure-reason histogram', async () => {
  const s = await setup();
  await mkdir(s.logDir, { recursive: true });
  await writeFile(join(s.logDir, 'dynamic-context.jsonl'), [
    { area: 'dynamic-context', sessionId: 'sess-1', ok: true, latencyMs: 100, estTokens: 500 },
    { area: 'dynamic-context', sessionId: 'sess-1', ok: false, reason: 'timeout', latencyMs: 3000, estTokens: 0 },
  ].map((l) => JSON.stringify(l)).join('\n') + '\n');
  const r = await runBenchmark(base(s, { spawnImpl: fakeClaude(s.stream) }));
  assert.deepEqual(r.failures, []);
  const rec = JSON.parse(await readFile(r.written[0], 'utf8'));
  assert.equal(rec.jev.calls, 2);
  assert.equal(rec.jev.ok_calls, 1);
  assert.deepEqual(rec.jev.reasons, { timeout: 1 });
});

test('an unpriced judge model leaves the side-channel cost null and keeps the warning', async () => {
  const s = await setup();
  await mkdir(s.logDir, { recursive: true });
  await writeFile(join(s.logDir, 'comment-policy-llm.jsonl'), JSON.stringify({ area: 'comment-policy', model: 'mystery-model', sessionId: 'sess-1', ok: true, latencyMs: 900, usage: { input_tokens: 2000, output_tokens: 100 } }) + '\n');
  const r = await runBenchmark(base(s, { area: 'comment-policy', arm: 'llm', spawnImpl: fakeClaude(s.stream) }));
  const rec = JSON.parse(await readFile(r.written[0], 'utf8'));
  assert.equal(rec.jev.cost_usd, null);
  assert.ok(rec.cost_warnings.some((w) => /mystery-model/.test(w)));
});

test('config isolation off leaves CLAUDE_CONFIG_DIR alone; expect_files_hit is the fraction of globs a changed path matched', async () => {
  const s = await setup();
  await writeFile(join(s.tasksDir, '01-a.md'), '---\nid: 01-a\ncategory: one-file\ngold_sections: []\ngold_tier: sonnet\nexpect_files:\n  - "src/*.kt"\n  - "docs/**/x.md"\nneeds_subagent: false\n---\nEdit A.\n');
  fakeClaude.calls = [];
  const config = { ...s.config, benchmark: { ...s.config.benchmark, isolateClaudeConfig: false } };
  const r = await runBenchmark(base(s, { config, spawnImpl: fakeClaude(s.stream, { edit: true }) }));
  assert.deepEqual(r.failures, []);
  const env = fakeClaude.calls[0].opts.env;
  assert.notEqual(env.CLAUDE_CONFIG_DIR, join(toolkitRoot(), '.claude-config'));
  assert.equal(env.CLAUDE_CONFIG_DIR, process.env.CLAUDE_CONFIG_DIR);
  const rec = JSON.parse(await readFile(r.written[0], 'utf8'));
  assert.equal(rec.diff.expect_files_hit, 0.5);
});

test('ALLOWED_TOOLS grants only read-only git subcommands', () => {
  assert.equal(ALLOWED_TOOLS, 'Read,Edit,Write,MultiEdit,Grep,Glob,Bash(git diff),Bash(git diff *),Bash(git status),Bash(git status *),Bash(git log),Bash(git log *),Bash(git show),Bash(git show *),Bash(./gradlew *),Agent');
});

test('a run that hit the turn cap and exited 1 keeps its usage, own subtype, and exit code, and is listed as a failure', async () => {
  const s = await setup();
  const capped = s.stream.replace('"subtype":"success"', '"subtype":"error_max_turns"');
  const r = await runBenchmark(base(s, { spawnImpl: fakeClaude(capped, { code: 1, edit: true }) }));
  assert.equal(r.written.length, 1);
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0].error, /claude exit 1/);
  const rec = JSON.parse(await readFile(r.written[0], 'utf8'));
  assert.equal(rec.subtype, 'error_max_turns');
  assert.equal(rec.exit_code, 1);
  assert.match(rec.error, /claude exit 1/);
  assert.equal(rec.usage.input_tokens, 1000);
  assert.equal(typeof rec.cost_usd, 'number');
  assert.equal(rec.num_turns, 4);
  assert.deepEqual(rec.diff.files, ['src/A.kt']);
});

test('a successful run records exit code 0, no error, and its permission denials', async () => {
  const s = await setup();
  const r = await runBenchmark(base(s, { spawnImpl: fakeClaude(s.stream) }));
  assert.deepEqual(r.failures, []);
  const rec = JSON.parse(await readFile(r.written[0], 'utf8'));
  assert.equal(rec.exit_code, 0);
  assert.equal(rec.error, undefined);
  assert.deepEqual(rec.permission_denials, { count: 1, by_tool: { Bash: 1 }, commands: ['git commit -m wip'] });
});

test('permission denials: non-Bash tools list their name, commands are truncated to 120 chars and capped at 20', async () => {
  const s = await setup();
  const long = 'x'.repeat(200);
  const denials = [{ tool_name: 'WebFetch', tool_use_id: 'a', tool_input: { url: 'u' } }, ...Array.from({ length: 24 }, (_, i) => ({ tool_name: 'Bash', tool_use_id: `b${i}`, tool_input: { command: i === 0 ? long : `cmd ${i}` } }))];
  const stream = s.stream.replace(/"permission_denials":\[[^\]]*\]/, `"permission_denials":${JSON.stringify(denials)}`);
  const r = await runBenchmark(base(s, { spawnImpl: fakeClaude(stream) }));
  const rec = JSON.parse(await readFile(r.written[0], 'utf8'));
  assert.equal(rec.permission_denials.count, 25);
  assert.deepEqual(rec.permission_denials.by_tool, { WebFetch: 1, Bash: 24 });
  assert.equal(rec.permission_denials.commands.length, 20);
  assert.equal(rec.permission_denials.commands[0], 'WebFetch');
  assert.equal(rec.permission_denials.commands[1], 'x'.repeat(120));
});

test('the target is reset to the baseline after the last task', async () => {
  const s = await setup();
  const r = await runBenchmark(base(s, { spawnImpl: fakeClaude(s.stream, { edit: true }) }));
  assert.deepEqual(r.failures, []);
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: s.tgt, encoding: 'utf8' });
  assert.equal(status, '');
});

test('a failing final reset is logged and the results are still returned', async () => {
  const s = await setup();
  const logs = [];
  let resets = 0;
  const runGitImpl = (cwd, args) => {
    if (args[0] === 'reset') { resets += 1; if (resets > 1) return null; }
    try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trimEnd(); } catch { return null; }
  };
  const r = await runBenchmark(base(s, { spawnImpl: fakeClaude(s.stream), runGitImpl, log: (m) => logs.push(m) }));
  assert.equal(r.written.length, 1);
  assert.deepEqual(r.failures, []);
  assert.equal(resets, 2);
  assert.ok(logs.some((m) => /final reset failed/.test(m)));
});
