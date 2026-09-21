import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDynamicContext } from '../src/adapters/dynamic-context/hook.mjs';
import { DEFAULTS } from '../src/client/config.mjs';

async function target() {
  const dir = await mkdtemp(join(tmpdir(), 'jevdct-'));
  const rules = join(dir, '.claude', 'jev-rules');
  await mkdir(rules, { recursive: true });
  await writeFile(join(rules, '00-core.md'), '---\nid: core\nalways: true\n---\ncore body\n');
  await writeFile(join(rules, '02-compose.md'), '---\nid: compose\nsummary: Compose rules\npaths:\n  - "**/ui/**"\n---\n# Compose\ncompose body\n');
  await writeFile(join(rules, '05-room.md'), '---\nid: room\nsummary: Room rules\n---\n# Room\nroom body\n');
  return dir;
}

async function cfg(dir, overrides = {}) {
  return { ...DEFAULTS, logDir: join(dir, 'logs'), recordingsDir: join(dir, 'rec'), allowedRoots: [dir], apiKey: 'K', disabled: false, configMissing: false, configInvalid: false, ...overrides };
}

const fetchWith = (nouls) => async () => ({ status: 200, text: async () => JSON.stringify({ answers: Object.fromEntries(Object.entries(nouls).map(([k, v]) => [k, { type: 'noul', noul: v }])) }) });
const input = (dir, prompt, extra = {}) => ({ session_id: 'sess', cwd: dir, hook_event_name: 'UserPromptSubmit', user_prompt: prompt, ...extra });

test('injects relevant sections in full, never core, with the header', async () => {
  const dir = await target();
  const r = await runDynamicContext(input(dir, 'Add a dark preview to SocketListScreen'), { config: await cfg(dir), fetchImpl: fetchWith({ relevant_compose: 0.9, relevant_room: 0.1 }) });
  const ctx = r.output.hookSpecificOutput.additionalContext;
  assert.equal(r.output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(ctx, /^Project rules selected for this task \(JEV\):/);
  assert.match(ctx, /compose body/);
  assert.doesNotMatch(ctx, /room body/);
  assert.doesNotMatch(ctx, /core body/);
  assert.equal(r.exitCode, 0);
});

test('second prompt in the same session injects only new sections', async () => {
  const dir = await target();
  const config = await cfg(dir);
  await runDynamicContext(input(dir, 'p1'), { config, fetchImpl: fetchWith({ relevant_compose: 0.9, relevant_room: 0.1 }) });
  let sent;
  const f = async (url, init) => { sent = JSON.parse(init.body); return fetchWith({ relevant_room: 0.8 })(); };
  const r = await runDynamicContext(input(dir, 'p2'), { config, fetchImpl: f });
  assert.deepEqual(sent.state.sections.map((s) => s.id), ['room']);
  assert.match(r.output.hookSpecificOutput.additionalContext, /room body/);
  assert.doesNotMatch(r.output.hookSpecificOutput.additionalContext, /compose body/);
});

test('nothing relevant, no rules folder, empty prompt, Jev failure, disabled, and foreign cwd all yield null', async () => {
  const dir = await target();
  const config = await cfg(dir);
  assert.deepEqual(await runDynamicContext(input(dir, 'p'), { config, fetchImpl: fetchWith({ relevant_compose: 0.2, relevant_room: 0.1 }) }), { output: null, exitCode: 0 });
  const bare = await mkdtemp(join(tmpdir(), 'jevbare-'));
  assert.deepEqual(await runDynamicContext(input(bare, 'p'), { config: await cfg(bare), fetchImpl: fetchWith({}) }), { output: null, exitCode: 0 });
  assert.deepEqual(await runDynamicContext(input(dir, ''), { config, fetchImpl: fetchWith({}) }), { output: null, exitCode: 0 });
  assert.deepEqual(await runDynamicContext(input(dir, 'p'), { config, fetchImpl: async () => { throw new TypeError('down'); } }), { output: null, exitCode: 0 });
  assert.deepEqual(await runDynamicContext(input(dir, 'p'), { config: await cfg(dir, { disabled: true }), fetchImpl: fetchWith({}) }), { output: null, exitCode: 0 });
  const r = await runDynamicContext(input(dir, 'p', { cwd: '/elsewhere' }), { config, fetchImpl: fetchWith({}) });
  assert.deepEqual(r, { output: null, exitCode: 0 });
  const log = await readFile(join(config.logDir, 'dynamic-context.jsonl'), 'utf8');
  assert.match(log, /"event":"skipped"/);
});

test('accepts the legacy prompt field name', async () => {
  const dir = await target();
  const r = await runDynamicContext({ session_id: 's', cwd: dir, prompt: 'p' }, { config: await cfg(dir), fetchImpl: fetchWith({ relevant_compose: 0.9, relevant_room: 0.9 }) });
  assert.match(r.output.hookSpecificOutput.additionalContext, /compose body/);
});
