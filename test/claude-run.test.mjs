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
  assert.equal(events.length, 9);
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
  assert.equal(toolUses(events, { topLevel: false }).length, 4);
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

test('runClaude on timeout sends SIGTERM, then SIGKILL after the grace period, and resolves once on close', async () => {
  const signals = [];
  const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter();
  let closes = 0;
  p.on('close', () => { closes += 1; });
  const killImpl = (child, signal) => { signals.push(signal); if (signal === 'SIGKILL') setTimeout(() => child.emit('close', null), 1); };
  let resolutions = 0;
  const r = await runClaude({ cwd: '/t', prompt: 'p', model: 'm', maxTurns: 1, allowedTools: '', env: {}, spawnImpl: () => p, killImpl, timeoutMs: 20, graceMs: 10 }).then((x) => { resolutions += 1; return x; });
  p.emit('close', 0);
  await new Promise((res) => setTimeout(res, 40));
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(r.timedOut, true);
  assert.equal(resolutions, 1);
  assert.equal(closes, 2);
});

test('runClaude resolves instead of rejecting when spawn throws', async () => {
  const r = await runClaude({ cwd: '/t', prompt: 'p', model: 'm', maxTurns: 1, allowedTools: '', env: {}, spawnImpl: () => { throw new Error('spawn boom'); }, timeoutMs: 20 });
  assert.equal(r.code, null);
  assert.equal(r.timedOut, false);
  assert.match(r.stderr, /spawn boom/);
});
