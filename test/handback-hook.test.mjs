import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runSubagentStart } from '../src/adapters/handback-check/start-hook.mjs';
import { runHandbackCheck } from '../src/adapters/handback-check/hook.mjs';
import { DEFAULTS } from '../src/client/config.mjs';

async function repo() {
  const dir = await mkdtemp(join(tmpdir(), 'jevhb-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@e.com'); git('config', 'user.name', 't');
  await mkdir(join(dir, 'src')); await writeFile(join(dir, 'src', 'A.kt'), 'class A\n');
  git('add', '-A'); git('commit', '-q', '-m', 'base');
  return dir;
}
const cfg = (dir, o = {}) => ({ ...DEFAULTS, logDir: join(dir, 'logs'), recordingsDir: join(dir, 'rec'), allowedRoots: [dir], apiKey: 'K', disabled: false, configMissing: false, configInvalid: false, ...o });
const fetchWith = (nouls) => async () => ({ status: 200, text: async () => JSON.stringify({ answers: Object.fromEntries(Object.entries(nouls).map(([k, v]) => [k, { type: 'noul', noul: v }])) }) });
const ALL = { claims_tests_run: 0.9, claims_tests_pass: 0.9, claims_build_ok: 0.9, claims_tests_added: 0.95, claims_complete: 0.9, reports_blocker: 0.05 };
const stop = (dir, summary, extra = {}) => ({ session_id: 's', cwd: dir, hook_event_name: 'SubagentStop', agent_id: 'ag1', agent_type: 'general-purpose', last_assistant_message: summary, model: 'opus', ...extra });

test('start snapshot then stop: card attributes only the subagent changes and flags the missing tests', async () => {
  const dir = await repo();
  const config = cfg(dir);
  await writeFile(join(dir, 'src', 'Pre.kt'), 'class Pre\n');
  const s = await runSubagentStart({ session_id: 's', cwd: dir, agent_id: 'ag1', agent_type: 'general-purpose' }, { config });
  assert.deepEqual(s, { output: null, exitCode: 0 });
  await stat(join(config.logDir, 'handback', 'ag1.start.json'));
  await writeFile(join(dir, 'src', 'A.kt'), 'class A { }\n');
  const r = await runHandbackCheck(stop(dir, 'Implemented A and added tests in ATest.kt; all tests pass.'), { config, fetchImpl: fetchWith(ALL) });
  const card = r.output.hookSpecificOutput.additionalContext;
  assert.equal(r.output.hookSpecificOutput.hookEventName, 'SubagentStop');
  assert.match(card, /^JEV hand-back check \(general-purpose, opus\)/);
  assert.match(card, /files changed 1 \(src\/A\.kt\)/);
  assert.match(card, /attribution snapshot/);
  assert.match(card, /claims tests added; no test files changed/);
  assert.match(card, /mentions ATest\.kt which is not in the diff/);
  assert.match(card, /Read full diff: yes/);
  assert.equal(await readFile(join(config.logDir, 'handback', 'ag1.card.md'), 'utf8'), card);
  await assert.rejects(stat(join(config.logDir, 'handback', 'ag1.start.json')));
});

test('without a start snapshot the card falls back to HEAD attribution', async () => {
  const dir = await repo();
  await writeFile(join(dir, 'src', 'A.kt'), 'class A2\n');
  const r = await runHandbackCheck(stop(dir, 'Edited src/A.kt.', { agent_id: 'ag2' }), { config: cfg(dir), fetchImpl: fetchWith({ ...ALL, claims_tests_added: 0.05, claims_tests_pass: 0.1 }) });
  assert.match(r.output.hookSpecificOutput.additionalContext, /attribution head/);
  assert.match(r.output.hookSpecificOutput.additionalContext, /^Flags: none$/m);
});

test('Jev failure still yields a card with facts and code-only flags', async () => {
  const dir = await repo();
  await writeFile(join(dir, 'src', 'A.kt'), 'class A3\n');
  const r = await runHandbackCheck(stop(dir, 'Edited src/A.kt and Zed.kt', { agent_id: 'ag3' }), { config: cfg(dir), fetchImpl: async () => { throw new TypeError('down'); } });
  const card = r.output.hookSpecificOutput.additionalContext;
  assert.match(card, /Claims: unavailable \(Jev network\)/);
  assert.match(card, /mentions Zed\.kt which is not in the diff/);
});

test('excluded agent types, non-git cwd, disabled, and foreign cwd yield null', async () => {
  const dir = await repo();
  const config = cfg(dir);
  for (const t of ['Explore', 'Plan', 'claude-code-guide']) {
    assert.deepEqual(await runHandbackCheck(stop(dir, 'x', { agent_type: t }), { config, fetchImpl: fetchWith(ALL) }), { output: null, exitCode: 0 });
  }
  const bare = await mkdtemp(join(tmpdir(), 'jevnogit-'));
  assert.deepEqual(await runHandbackCheck(stop(bare, 'x'), { config: cfg(bare), fetchImpl: fetchWith(ALL) }), { output: null, exitCode: 0 });
  assert.deepEqual(await runHandbackCheck(stop(dir, 'x'), { config: cfg(dir, { disabled: true }), fetchImpl: fetchWith(ALL) }), { output: null, exitCode: 0 });
  assert.deepEqual(await runHandbackCheck(stop(dir, 'x', { cwd: '/elsewhere' }), { config, fetchImpl: fetchWith(ALL) }), { output: null, exitCode: 0 });
  assert.deepEqual(await runSubagentStart({ cwd: '/elsewhere', agent_id: 'z', agent_type: 'general-purpose' }, { config }), { output: null, exitCode: 0 });
});
