import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { route } from '../src/adapters/model-router/route.mjs';
import { DEFAULTS, toolkitRoot } from '../src/client/config.mjs';

async function cfg(o = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'jevrt-'));
  return { ...DEFAULTS, logDir: join(dir, 'logs'), recordingsDir: join(dir, 'rec'), allowedRoots: ['/allowed'], apiKey: 'K', disabled: false, configMissing: false, configInvalid: false, ...o };
}
const fetchWith = ({ tier, conf, probs, broad, change }) => async () => ({ status: 200, text: async () => JSON.stringify({ answers: {
  tier: { type: 'choice', choice: tier, probabilities: probs, confidence: conf },
  needs_broad_exploration: { type: 'noul', noul: broad },
  asks_for_change: { type: 'noul', noul: change },
} }) });

test('confident answer is returned as-is', async () => {
  const r = await route('grep for FrameStore usages', { config: await cfg(), cwd: '/allowed', fetchImpl: fetchWith({ tier: 'haiku', conf: 0.92, probs: { haiku: 0.9, sonnet: 0.08, opus: 0.02 }, broad: 0.1, change: 0.05 }) });
  assert.equal(r.tier, 'haiku');
  assert.equal(r.confidence, 0.92);
  assert.equal(r.fallback_used, false);
  assert.equal(r.needs_broad_exploration, 0.1);
  assert.equal(r.asks_for_change, 0.05);
  assert.equal(typeof r.latency_ms, 'number');
  assert.deepEqual(r.probabilities, { haiku: 0.9, sonnet: 0.08, opus: 0.02 });
});

test('low confidence falls back to opus for changes and sonnet for questions', async () => {
  const change = await route('implement the thing', { config: await cfg(), cwd: '/allowed', fetchImpl: fetchWith({ tier: 'haiku', conf: 0.4, probs: {}, broad: 0.5, change: 0.9 }) });
  assert.deepEqual([change.tier, change.fallback_used], ['opus', true]);
  const ask = await route('how does X work', { config: await cfg(), cwd: '/allowed', fetchImpl: fetchWith({ tier: 'opus', conf: 0.4, probs: {}, broad: 0.9, change: 0.1 }) });
  assert.deepEqual([ask.tier, ask.fallback_used], ['sonnet', true]);
});

test('Jev failure returns tier null with the reason', async () => {
  const r = await route('x', { config: await cfg(), cwd: '/allowed', fetchImpl: async () => ({ status: 503, text: async () => 'down' }) });
  assert.equal(r.tier, null);
  assert.match(r.error, /http_503/);
});

test('bin: empty brief exits 1; a routed brief prints one JSON line', async () => {
  const run = (args, env, stdinText) => new Promise((resolve) => {
    const p = spawn(process.execPath, [join(toolkitRoot(), 'bin', 'jev-route.mjs'), ...args], { env: { ...process.env, ...env } });
    let out = ''; let err = '';
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => resolve({ code, out, err }));
    p.stdin.end(stdinText);
  });
  const empty = await run([], { JEV_DISABLE: '' }, '   ');
  assert.equal(empty.code, 1);
  assert.match(empty.err, /brief/);
  const dir = await mkdtemp(join(tmpdir(), 'jevrtbin-'));
  const cfgPath = join(dir, 'c.json');
  await writeFile(cfgPath, JSON.stringify({ allowedRoots: [toolkitRoot()], logDir: join(dir, 'logs'), mode: 'replay' }));
  const r = await run([], { JEV_CONFIG: cfgPath, JEV_DISABLE: '' }, 'trace the frame path');
  assert.equal(r.code, 3);
  const parsed = JSON.parse(r.out.trim());
  assert.equal(parsed.tier, null);
  assert.match(parsed.error, /no_recording/);
});
