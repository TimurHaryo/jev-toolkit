import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { median, p90, applyLabels, readLabels, summarizeRun, renderReport, compareRuns } from '../src/bench/report.mjs';

const rec = (arm, task, over = {}) => ({ run_id: 'r', area: 'dynamic-context', arm, task, rep: 1, subtype: 'success', usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 }, cost_usd: 0.01, duration_ms: 10000, num_turns: 3, quality: { compile: null, gold_sections_recall: 0.5, gold_sections_precision: 1, violations_remaining: null, flags_raised: null, orchestrator_read_full_diff: null }, jev: { calls: 1, latency_ms_total: 120, est_tokens: 800, cost_usd: 0.0000336, answers: [] }, ...over });

test('median and p90 use nearest rank', () => {
  assert.equal(median([3, 1, 2]), 2); assert.equal(median([1, 2, 3, 4]), 2.5); assert.equal(median([]), null);
  assert.equal(p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 9); assert.equal(p90([5]), 5);
});

test('labels apply by area/arm/task/rep and missing label files read as empty', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jevlab-'));
  const path = join(dir, 'r.jsonl');
  await writeFile(path, JSON.stringify({ area: 'dynamic-context', arm: 'jev', task: 'a', rep: 1, violations_remaining: 2 }) + '\n');
  const out = applyLabels([rec('jev', 'a'), rec('jev', 'b')], await readLabels(path));
  assert.equal(out[0].quality.violations_remaining, 2);
  assert.equal(out[1].quality.violations_remaining, null);
  assert.deepEqual(await readLabels(join(dir, 'missing.jsonl')), []);
});

test('summarizeRun groups by area and arm, excludes failures and unpriced records, and averages quality', () => {
  const records = [
    rec('jev', 'a'), rec('jev', 'b', { usage: { input_tokens: 3000, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, cost_usd: 0.03, jev: { calls: 3, latency_ms_total: 300, est_tokens: 100, cost_usd: 0.0000042, answers: [] } }),
    rec('full', 'a', { quality: { gold_sections_recall: 1, gold_sections_precision: 0.2 }, jev: { calls: 0, latency_ms_total: 0, est_tokens: 0, cost_usd: 0, answers: [] } }),
    rec('full', 'b', { subtype: 'failed', error: 'claude exit 1' }),
    rec('native', 'a', { cost_usd: null }),
  ];
  const s = summarizeRun(records);
  assert.equal(s['dynamic-context'].jev.n, 2);
  assert.equal(s['dynamic-context'].jev.metrics.input_tokens.median, 2000);
  assert.equal(s['dynamic-context'].jev.metrics.cost_usd.p90, 0.03);
  assert.equal(s['dynamic-context'].jev.quality.gold_sections_recall, 0.5);
  assert.equal(s['dynamic-context'].jev.jev.calls_per_task, 2);
  assert.equal(s['dynamic-context'].jev.jev.latency_ms_median, 110);
  assert.equal(s['dynamic-context'].full.n, 1);
  assert.equal(s['dynamic-context'].full.quality.gold_sections_precision, 0.2);
  assert.equal(s['dynamic-context'].native, undefined);
  assert.deepEqual(s.excluded.map((e) => [e.arm, e.task, e.reason]), [['full', 'b', 'claude exit 1'], ['native', 'a', 'cost_usd null']]);
});

test('renderReport and compareRuns produce markdown with the expected rows', () => {
  const manifest = { run_id: 'r', date: '2026-09-28T10:00:00Z', provider: 'deepseek', models: { opus: 'x', sonnet: 'y', haiku: 'y', subagent: 'y' }, claude_code_version: '2.1.278', toolkit_commit: 'abc' };
  const s = summarizeRun([rec('jev', 'a'), rec('full', 'a')]);
  const md = renderReport(manifest, s);
  assert.match(md, /^# JEV benchmark run r/m);
  assert.match(md, /\| metric \| full \| jev \|/);
  assert.match(md, /input tokens \(median \/ p90\)/);
  assert.match(md, /gold sections recall/);
  assert.match(md, /Jev calls \/ task/);
  assert.match(md, /## Excluded/);
  const cmp = compareRuns({ manifest, summary: s }, { manifest: { ...manifest, run_id: 'r2' }, summary: summarizeRun([rec('jev', 'a', { cost_usd: 0.02 })]) });
  assert.match(cmp, /dynamic-context \/ jev/);
  assert.match(cmp, /cost median \| 0\.0100 \| 0\.0200 \| \+0\.0100/);
});

test('readLabels rejects a malformed line with its line number', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jevlab-'));
  const path = join(dir, 'bad.jsonl');
  await writeFile(path, `${JSON.stringify({ area: 'a', arm: 'b', task: 'c', rep: 1, violations_remaining: 0 })}\n{not json\n`);
  await assert.rejects(readLabels(path), /line 2/);
});
