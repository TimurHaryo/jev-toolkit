import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runHandbackPre } from '../src/adapters/handback-check/pre-hook.mjs';
import { runHandbackPost } from '../src/adapters/handback-check/hook.mjs';
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
const NOTHING = { output: null, exitCode: 0 };
const TOOL_INPUT = { prompt: 'do X', description: 'x', subagent_type: 'general-purpose', model: 'opus' };

const pre = (dir, extra = {}) => ({ session_id: 's', cwd: dir, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: 'tu1', tool_input: { ...TOOL_INPUT }, ...extra });
const post = (dir, toolResponse, extra = {}) => ({ ...pre(dir), hook_event_name: 'PostToolUse', tool_response: toolResponse, ...extra });
const logLines = async (config) => (await readFile(join(config.logDir, 'handback-check.jsonl'), 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));

test('pre snapshot then post: card attributes only the subagent changes and flags the missing tests', async () => {
  const dir = await repo();
  const config = cfg(dir);
  await writeFile(join(dir, 'src', 'Pre.kt'), 'class Pre\n');
  const s = await runHandbackPre(pre(dir), { config });
  assert.deepEqual(s, NOTHING);
  await stat(join(config.logDir, 'handback', 'tu1.start.json'));
  await writeFile(join(dir, 'src', 'A.kt'), 'class A { }\n');
  const r = await runHandbackPost(post(dir, 'Implemented A and added tests in ATest.kt; all tests pass.'), { config, fetchImpl: fetchWith(ALL) });
  const card = r.output.hookSpecificOutput.additionalContext;
  assert.equal(r.output.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(card, /^JEV hand-back check \(general-purpose, opus\)/);
  assert.match(card, /files changed 1 \(src\/A\.kt\)/);
  assert.match(card, /attribution snapshot/);
  assert.match(card, /claims tests added; no test files changed/);
  assert.doesNotMatch(card, /mentions /);
  assert.match(card, /^Mentioned but unchanged: ATest\.kt$/m);
  assert.match(card, /Read full diff: yes/);
  assert.equal(await readFile(join(config.logDir, 'handback', 'tu1.card.md'), 'utf8'), card);
  await assert.rejects(stat(join(config.logDir, 'handback', 'tu1.start.json')));
});

test('without a pre snapshot the card falls back to HEAD attribution', async () => {
  const dir = await repo();
  await writeFile(join(dir, 'src', 'A.kt'), 'class A2\n');
  const r = await runHandbackPost(post(dir, 'Edited src/A.kt.', { tool_use_id: 'tu2' }), { config: cfg(dir), fetchImpl: fetchWith({ ...ALL, claims_tests_added: 0.05, claims_tests_pass: 0.1 }) });
  assert.match(r.output.hookSpecificOutput.additionalContext, /attribution head/);
  assert.match(r.output.hookSpecificOutput.additionalContext, /^Flags: none$/m);
});

test('Jev failure still yields a card with facts and code-only flags', async () => {
  const dir = await repo();
  await writeFile(join(dir, 'src', 'A.kt'), 'class A3\n');
  const r = await runHandbackPost(post(dir, 'Edited src/A.kt and Zed.kt', { tool_use_id: 'tu3' }), { config: cfg(dir), fetchImpl: async () => { throw new TypeError('down'); } });
  const card = r.output.hookSpecificOutput.additionalContext;
  assert.match(card, /Claims: unavailable \(Jev network\)/);
  assert.match(card, /^Flags: none$/m);
  assert.match(card, /^Mentioned but unchanged: Zed\.kt$/m);
});

test('an absolute-path mention of a changed file is not listed as unchanged', async () => {
  const dir = await repo();
  await writeFile(join(dir, 'src', 'A.kt'), 'class A6\n');
  const r = await runHandbackPost(post(dir, `Edited ${join(dir, 'src', 'A.kt')}.`, { tool_use_id: 'tu8' }), { config: cfg(dir), fetchImpl: fetchWith({ ...ALL, claims_tests_added: 0.05 }) });
  const card = r.output.hookSpecificOutput.additionalContext;
  assert.match(card, /^Mentioned but unchanged: none$/m);
  assert.match(card, /^Flags: none$/m);
});

test('excluded subagent types, non-git cwd, disabled, and foreign cwd yield null', async () => {
  const dir = await repo();
  const config = cfg(dir);
  for (const t of ['Explore', 'Plan', 'claude-code-guide']) {
    const extra = { tool_input: { ...TOOL_INPUT, subagent_type: t } };
    assert.deepEqual(await runHandbackPost(post(dir, 'x', extra), { config, fetchImpl: fetchWith(ALL) }), NOTHING);
    assert.deepEqual(await runHandbackPre(pre(dir, { ...extra, tool_use_id: 'tuex' }), { config }), NOTHING);
    await assert.rejects(stat(join(config.logDir, 'handback', 'tuex.start.json')));
  }
  const bare = await mkdtemp(join(tmpdir(), 'jevnogit-'));
  assert.deepEqual(await runHandbackPost(post(bare, 'x'), { config: cfg(bare), fetchImpl: fetchWith(ALL) }), NOTHING);
  assert.deepEqual(await runHandbackPost(post(dir, 'x'), { config: cfg(dir, { disabled: true }), fetchImpl: fetchWith(ALL) }), NOTHING);
  assert.deepEqual(await runHandbackPost(post(dir, 'x', { cwd: '/elsewhere' }), { config, fetchImpl: fetchWith(ALL) }), NOTHING);
  assert.deepEqual(await runHandbackPre(pre(dir, { cwd: '/elsewhere', tool_use_id: 'tufz' }), { config }), NOTHING);
  await assert.rejects(stat(join(config.logDir, 'handback', 'tufz.start.json')));
});

test('non-Agent tools are ignored by both hooks', async () => {
  const dir = await repo();
  const config = cfg(dir);
  const extra = { tool_name: 'Edit', tool_use_id: 'tuedit' };
  assert.deepEqual(await runHandbackPre(pre(dir, extra), { config }), NOTHING);
  assert.deepEqual(await runHandbackPost(post(dir, 'Edited src/A.kt.', extra), { config, fetchImpl: fetchWith(ALL) }), NOTHING);
  await assert.rejects(stat(join(config.logDir, 'handback', 'tuedit.start.json')));
});

test('tool_response as a content array is joined', async () => {
  const dir = await repo();
  await writeFile(join(dir, 'src', 'A.kt'), 'class A4\n');
  const response = [{ type: 'text', text: 'Edited src/A.kt.' }, { type: 'text', text: 'Tests pass.' }];
  const r = await runHandbackPost(post(dir, response, { tool_use_id: 'tu5' }), { config: cfg(dir), fetchImpl: fetchWith({ ...ALL, claims_tests_added: 0.05 }) });
  const card = r.output.hookSpecificOutput.additionalContext;
  assert.match(card, /files changed 1 \(src\/A\.kt\)/);
  assert.match(card, /tests pass 0\.90/);
  assert.match(card, /^Flags: none$/m);
});

test('an async dispatch response emits nothing and keeps the snapshot', async () => {
  const dir = await repo();
  const config = cfg(dir);
  await runHandbackPre(pre(dir, { tool_use_id: 'tu6' }), { config });
  const r = await runHandbackPost(post(dir, 'Async agent launched successfully…', { tool_use_id: 'tu6' }), { config, fetchImpl: fetchWith(ALL) });
  assert.deepEqual(r, NOTHING);
  await stat(join(config.logDir, 'handback', 'tu6.start.json'));
  assert.ok((await logLines(config)).some((l) => l.event === 'skipped' && l.reason === 'async_dispatch'));
});

test('model falls back to CLAUDE_CODE_SUBAGENT_MODEL', async () => {
  const dir = await repo();
  await writeFile(join(dir, 'src', 'A.kt'), 'class A5\n');
  const { model, ...toolInput } = TOOL_INPUT;
  assert.equal(model, 'opus');
  const r = await runHandbackPost(post(dir, 'Edited src/A.kt.', { tool_use_id: 'tu7', tool_input: toolInput }), { config: cfg(dir), env: { CLAUDE_CODE_SUBAGENT_MODEL: 'sonnet' }, fetchImpl: fetchWith(ALL) });
  assert.match(r.output.hookSpecificOutput.additionalContext, /^JEV hand-back check \(general-purpose, sonnet\)/);
});
