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

import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { checkHooks } from '../src/bench/hooks-check.mjs';
import { runGit } from '../src/adapters/handback-check/git.mjs';

async function repo({ unmanagedRules = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'jevhcrepo-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@e.com'); git('config', 'user.name', 't');
  await mkdir(join(dir, 'src')); await writeFile(join(dir, 'src', 'A.kt'), 'class A\n');
  if (unmanagedRules) { await mkdir(join(dir, '.claude', 'jev-rules'), { recursive: true }); await writeFile(join(dir, '.claude', 'jev-rules', 'own.md'), 'mine\n'); }
  git('add', '-A'); git('commit', '-q', '-m', 'base'); git('tag', 'jev-baseline');
  return dir;
}

async function harness({ unmanagedRules = false, throwOnSpawn = 0 } = {}) {
  const targetDir = await repo({ unmanagedRules });
  const logDir = await mkdtemp(join(tmpdir(), 'jevhclog-'));
  const spawns = []; const gitCalls = [];
  const spawnImpl = (cmd, args, opts) => {
    spawns.push({ args, env: opts.env });
    const n = spawns.length;
    if (n === throwOnSpawn) throw new Error(`probe ${n} spawn failed`);
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    setImmediate(() => { child.stdout.emit('data', `${JSON.stringify({ type: 'result', session_id: `s-${n}` })}\n`); child.emit('close', 0); });
    return child;
  };
  const runGitImpl = (cwd, a) => { gitCalls.push({ args: a, after: spawns.length }); return runGit(cwd, a); };
  const opts = {
    targetDir,
    config: { allowedRoots: [targetDir], logDir },
    provider: { name: 'fake', baseUrl: null, authTokenEnv: 'ANTHROPIC_API_KEY', models: { opus: 'm', sonnet: 'm', haiku: 'm', subagent: 'm' }, pricing: {} },
    env: { ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: 'https://leak' },
    spawnImpl, runGitImpl,
  };
  const resets = () => gitCalls.filter((c) => JSON.stringify(c.args) === JSON.stringify(['reset', '--hard', 'jev-baseline']));
  return { opts, spawns, resets };
}

test('checkHooks runs the probes in order, records outcomes, strips a leaked base URL, and resets before and after', async () => {
  const { opts, spawns, resets } = await harness();
  const { checks, sessions } = await checkHooks(opts);
  assert.equal(spawns.length, 3);
  assert.deepEqual(spawns.map((s) => s.args[1]), PROBES.map((p) => p.prompt));
  assert.deepEqual(sessions, { context: { session_id: 's-1', code: 0, timedOut: false }, comment: { session_id: 's-2', code: 0, timedOut: false }, agent: { session_id: 's-3', code: 0, timedOut: false } });
  assert.ok(spawns.every((s) => !('ANTHROPIC_BASE_URL' in s.env)));
  assert.ok(resets().length >= 2);
  assert.equal(resets().at(-1).after, 3);
  assert.ok(checks.every((c) => c.ok === false));
  assert.match(checks.find((c) => c.name === 'dynamic-context hook fired').detail, /no line with sessionId s-1; probe exit 0, timedOut false/);
});

test('checkHooks records a failed probe spawn and still resets afterwards', async () => {
  const { opts, spawns, resets } = await harness({ throwOnSpawn: 3 });
  const { sessions } = await checkHooks(opts);
  assert.equal(spawns.length, 3);
  assert.deepEqual(sessions.agent, { session_id: null, code: null, timedOut: false });
  assert.equal(resets().length, 2);
  assert.equal(resets()[1].after, 3);
});

test('checkHooks resets the target when a probe throws mid-run and rejects with that error', async () => {
  const { opts, resets } = await harness();
  const log = (m) => { if (m === 'probe agent') throw new Error('probe agent exploded'); };
  await assert.rejects(checkHooks({ ...opts, log }), /probe agent exploded/);
  assert.equal(resets().length, 2);
  assert.equal(resets()[1].after, 2);
});

test('checkHooks resets the target when the install refuses', async () => {
  const { opts, spawns, resets } = await harness({ unmanagedRules: true });
  await assert.rejects(checkHooks(opts), /unmanaged/);
  assert.equal(spawns.length, 0);
  assert.equal(resets().length, 2);
});
