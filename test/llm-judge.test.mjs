import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
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
  assert.equal(fakeSpawn.last.opts.cwd, tmpdir());
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
  const r = await d('echo', { text: 'yes' }, { config: { logDir: dir }, sessionId: 'sess-x' });
  assert.equal(r.ok, true);
  assert.equal(r.answers.yes.noul, 0.7);
  const { readFile } = await import('node:fs/promises');
  const line = JSON.parse((await readFile(join(dir, 'echo-llm.jsonl'), 'utf8')).trim().split('\n').pop());
  assert.equal(line.sessionId, 'sess-x');
  assert.equal(typeof line.usage, 'object');
  assert.notEqual(line.usage, null);
});

test('makeJudgeDecide honours timeoutMs', async () => {
  const d = makeJudgeDecide({ model: 'm', spawnImpl: fakeSpawn({ stdout: 'x', delayMs: 200 }), env: {}, loadArea: () => import('./fixtures/questions/echo-area.mjs'), timeoutMs: 20 });
  const { mkdtemp } = await import('node:fs/promises'); const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'jevjudge-'));
  const r = await d('echo', { text: 'yes' }, { config: { logDir: dir } });
  assert.equal(r.reason, 'judge_timeout');
});

test('judge never passes the parent session markers to its claude child and keeps an isolated config dir', async () => {
  const out = JSON.stringify({ result: '{"narrates_0": 0.1, "kind_0": {"choice": "reason", "confidence": 0.7}}', usage: {} });
  const env = { CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', CLAUDE_CONFIG_DIR: '/tk/.claude-config', KEEP: 'y' };
  const r = await judge({ state: {}, questions, model: 'm', spawnImpl: fakeSpawn({ stdout: out }), env });
  assert.equal(r.ok, true);
  const seen = fakeSpawn.last.opts.env;
  assert.equal('CLAUDECODE' in seen, false);
  assert.equal('CLAUDE_CODE_ENTRYPOINT' in seen, false);
  assert.equal(seen.CLAUDE_CONFIG_DIR, '/tk/.claude-config');
  assert.equal(seen.KEEP, 'y');
  assert.equal(env.CLAUDECODE, '1');
});

test('parseJudgeAnswers accepts booleans for yes/no questions', () => {
  const r = parseJudgeAnswers('{"narrates_0": true, "kind_0": {"choice": "reason", "confidence": 0.9}}', questions);
  assert.equal(r.ok, true);
  assert.equal(r.answers.narrates_0.noul, 1);
  assert.equal(parseJudgeAnswers('{"narrates_0": false, "kind_0": {"choice": "reason", "confidence": 0.9}}', questions).answers.narrates_0.noul, 0);
});
