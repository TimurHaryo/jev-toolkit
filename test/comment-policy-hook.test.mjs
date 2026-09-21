import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
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

test('extra keys in answers are ignored, deny still fires', async () => {
  const f = async () => ({
    status: 200,
    text: async () => JSON.stringify({ answers: {
      narrates_0: { type: 'noul', noul: 0.95 },
      kind_0: { type: 'choice', choice: 'narration', probabilities: {}, confidence: 0.9 },
      note: 'ignored',
    } }),
  });
  const r = await runCommentPolicy(input('// increment counter\ncounter++\n'), { config: await cfg(), fetchImpl: f });
  assert.equal(r.output.hookSpecificOutput.permissionDecision, 'deny');
});

test('MultiEdit edits are examined together', async () => {
  const r = await runCommentPolicy(input(null, {
    tool_name: 'MultiEdit',
    tool_input: { file_path: '/proj/C.kt', edits: [
      { old_string: 'a', new_string: 'val a = 1' },
      { old_string: 'b', new_string: '// increment counter\ncounter++' },
    ] },
  }), { config: await cfg(), fetchImpl: fetchWith({ narrates_0: 0.95, kind_0: 'narration' }) });
  assert.equal(r.output.hookSpecificOutput.permissionDecision, 'deny');
});

test('cwd outside allowed roots allows without any call and logs a skip', async () => {
  let called = false;
  const config = await cfg();
  const r = await runCommentPolicy(input('// ===== HELPERS =====\nfun a() {}\n', { cwd: '/elsewhere' }), { config, fetchImpl: async () => { called = true; } });
  assert.deepEqual(r, { output: null, exitCode: 0 });
  assert.equal(called, false);
  const raw = await readFile(join(config.logDir, 'comment-policy.jsonl'), 'utf8');
  const line = JSON.parse(raw.trim());
  assert.equal(line.event, 'skipped');
  assert.equal(line.reason, 'not_allowed_root');
});

test('missing config allows without any call', async () => {
  let called = false;
  const r = await runCommentPolicy(input('// ===== HELPERS =====\nfun a() {}\n'), { config: await cfg({ configMissing: true }), fetchImpl: async () => { called = true; } });
  assert.deepEqual(r, { output: null, exitCode: 0 });
  assert.equal(called, false);
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

test('a throwing decideImpl fails open', async () => {
  const r = await runCommentPolicy(input('// increment counter\ncounter++\n'), { config: await cfg(), decideImpl: async () => { throw new Error('boom'); } });
  assert.deepEqual(r, { output: null, exitCode: 0 });
});
