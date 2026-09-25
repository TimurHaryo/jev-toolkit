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
