import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { median, p90, applyLabels, applyPricing, repriceAll, readLabels, summarizeRun, renderReport, compareRuns } from '../src/bench/report.mjs';

const rec = (arm, task, over = {}) => ({ run_id: 'r', area: 'dynamic-context', arm, task, rep: 1, subtype: 'success', usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 }, cost_usd: 0.01, duration_ms: 10000, num_turns: 3, quality: { compile: null, gold_sections_recall: 0.5, gold_sections_precision: 1, violations_remaining: null, flags_raised: null, orchestrator_read_full_diff: null }, jev: { calls: 1, ok_calls: 1, reasons: {}, latency_ms_total: 120, est_tokens: 800, cost_usd: 0.0000336, answers: [] }, ...over });

test('median and p90 use nearest rank', () => {
  assert.equal(median([3, 1, 2]), 2); assert.equal(median([1, 2, 3, 4]), 2.5); assert.equal(median([]), null);
  assert.equal(p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 9); assert.equal(p90([5]), 5);
});

test('labels apply by area/arm/task/rep and missing label files read as empty', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jevlab-'));
  const path = join(dir, 'r.jsonl');
  const stray = { area: 'dynamic-context', arm: 'jev', task: 'zz', rep: 1, violations_remaining: 1 };
  await writeFile(path, JSON.stringify({ area: 'dynamic-context', arm: 'jev', task: 'a', rep: 1, violations_remaining: 2 }) + '\n' + JSON.stringify(stray) + '\n');
  const { records: out, unmatched } = applyLabels([rec('jev', 'a'), rec('jev', 'b')], await readLabels(path));
  assert.equal(out[0].quality.violations_remaining, 2);
  assert.equal(out[1].quality.violations_remaining, null);
  assert.deepEqual(unmatched, [stray]);
  assert.deepEqual(await readLabels(join(dir, 'missing.jsonl')), []);
});

test('summarizeRun groups by area and arm, keeps incomplete runs with usage, prices only priced runs, and averages quality', () => {
  const records = [
    rec('jev', 'a'), rec('jev', 'b', { usage: { input_tokens: 3000, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, cost_usd: 0.03, jev: { calls: 3, ok_calls: 2, reasons: { timeout: 1 }, latency_ms_total: 300, est_tokens: 100, cost_usd: 0.0000042, answers: [] } }),
    rec('full', 'a', { quality: { gold_sections_recall: 1, gold_sections_precision: 0.2 }, jev: { calls: 0, ok_calls: 0, reasons: {}, latency_ms_total: 0, est_tokens: 0, cost_usd: 0, answers: [] } }),
    rec('full', 'b', { subtype: 'failed', error: 'claude exit 1', usage: undefined }),
    rec('full', 'c', { subtype: 'error_max_turns', usage: { input_tokens: 9000, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }),
    rec('native', 'a', { cost_usd: null, cost_warnings: ['no price for claude-x'] }),
    rec('gone', 'a', { subtype: 'failed', error: 'claude timed out', usage: undefined }),
  ];
  const s = summarizeRun(records);
  const dc = s['dynamic-context'];
  assert.equal(dc.jev.n, 2);
  assert.equal(dc.jev.metrics.input_tokens.median, 2000);
  assert.equal(dc.jev.metrics.prompt_tokens_total.median, (1500 + 3000) / 2);
  assert.equal(dc.jev.metrics.cost_usd.p90, 0.03);
  assert.equal(dc.jev.quality.gold_sections_recall, 0.5);
  assert.equal(dc.jev.jev.calls_per_task, 2);
  assert.equal(dc.jev.jev.latency_ms_median, 110);
  assert.equal(dc.jev.jev.ok_rate, (1 + 2 / 3) / 2);
  assert.deepEqual(dc.jev.jev.reasons, { timeout: 1 });
  assert.equal(dc.full.n, 2);
  assert.equal(dc.full.incomplete, 1);
  assert.equal(dc.full.excluded, 1);
  assert.equal(dc.full.metrics.input_tokens.p90, 9000);
  assert.equal(dc.full.quality.gold_sections_precision, (0.2 + 1) / 2);
  assert.equal(dc.full.jev.ok_rate, 1);
  assert.equal(dc.native.n, 1);
  assert.equal(dc.native.n_priced, 0);
  assert.equal(dc.native.metrics.input_tokens.median, 1000);
  assert.equal(dc.native.metrics.cost_usd.median, null);
  assert.equal(dc.gone.n, 0);
  assert.equal(dc.gone.excluded, 1);
  assert.deepEqual(s.excluded.map((e) => [e.arm, e.task, e.reason]), [['full', 'b', 'claude exit 1'], ['native', 'a', 'cost_usd null (excluded from cost only): no price for claude-x'], ['gone', 'a', 'claude timed out']]);
});

test('applyPricing fills a null cost from stored usage and a null side-channel cost from judge usage', () => {
  const pricing = { m1: { input: 1, output: 2, cache_read: 0.5, cache_write: 1 }, orch: { input: 10, output: 0, cache_read: 0, cache_write: 0 } };
  const fromPerModel = rec('native', 'a', { cost_usd: null, cost_warnings: ['no price for m1'], usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, per_model: { m1: { input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }, jev: { calls: 1, ok_calls: 1, reasons: {}, latency_ms_total: 1, est_tokens: 1e6, judge_usage: { m1: { input_tokens: 1e6, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }, cost_usd: null, answers: [] } });
  const fromUsage = rec('native', 'b', { cost_usd: null, orchestrator_model: 'orch', usage: { input_tokens: 1e6, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, per_model: {} } });
  const priced = rec('native', 'c');
  const out = applyPricing([fromPerModel, fromUsage, priced, rec('native', 'd', { subtype: 'failed', usage: undefined, cost_usd: undefined })], pricing, 0.5);
  assert.equal(out[0].cost_usd, 3);
  assert.equal(out[0].jev.cost_usd, 1 + 0.5);
  assert.deepEqual(out[0].cost_warnings, []);
  assert.equal(out[1].cost_usd, 10);
  assert.equal(out[2], priced);
  assert.equal(out[3].cost_usd, undefined);
  assert.equal(fromPerModel.cost_usd, null);
  const still = applyPricing([fromPerModel], {}, 0.5)[0];
  assert.equal(still.cost_usd, null);
  assert.ok(still.cost_warnings.some((w) => /m1/.test(w)));
});

test('renderReport and compareRuns produce markdown with the expected rows', () => {
  const manifest = { run_id: 'r', date: '2026-09-28T10:00:00Z', provider: 'deepseek', models: { opus: 'x', sonnet: 'y', haiku: 'y', subagent: 'y' }, claude_code_version: '2.1.278', toolkit_commit: 'abc' };
  const s = summarizeRun([rec('jev', 'a'), rec('jev', 'b', { jev: { calls: 2, ok_calls: 1, reasons: { timeout: 1 }, latency_ms_total: 10, est_tokens: 0, cost_usd: 0, answers: [] } }), rec('full', 'a'), rec('none', 'a', { subtype: 'failed', error: 'x', usage: undefined })]);
  const md = renderReport(manifest, s);
  assert.match(md, /^# JEV benchmark run r/m);
  assert.match(md, /How to read/);
  assert.match(md, /cache reads depend on run order/i);
  assert.match(md, /\| metric \| full \| jev \| none \|/);
  assert.match(md, /input tokens \(median \/ p90\)/);
  assert.match(md, /\| prompt tokens total \(median \/ p90\) \| 1500 \/ 1500 \| 1500 \/ 1500 \| n\/a \/ n\/a \|/);
  assert.match(md, /\| incomplete runs \| 0 \| 0 \| 0 \|/);
  assert.match(md, /\| excluded runs \| 0 \| 0 \| 1 \|/);
  assert.match(md, /\| n priced \| 1 \| 2 \| 0 \|/);
  assert.match(md, /gold sections recall/);
  assert.match(md, /\| side-channel calls \/ task \| 1\.00 \| 1\.50 \| n\/a \|/);
  assert.match(md, /\| side-channel ok rate \| 100% \| 75% \| n\/a \|/);
  assert.match(md, /\| side-channel failures \| none \| timeout=1 \| none \|/);
  assert.doesNotMatch(md, /Jev calls \/ task/);
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

test('summarizeRun counts every non-success record with usage as incomplete, whatever its subtype', () => {
  const s = summarizeRun([rec('jev', 'a'), rec('jev', 'b', { subtype: 'error_during_execution', exit_code: 1, error: 'claude exit 1' }), rec('jev', 'c', { subtype: 'failed', error: 'boom' })]);
  const a = s['dynamic-context'].jev;
  assert.equal(a.n, 3);
  assert.equal(a.incomplete, 2);
  assert.equal(a.n_priced, 3);
  assert.equal(a.excluded, 0);
});

test('the report has a permission-denials row under turns and a Denied commands section', () => {
  const manifest = { run_id: 'r', date: 'd', provider: 'p', models: {}, claude_code_version: 'v', toolkit_commit: 'c' };
  const pd = (count, commands) => ({ permission_denials: { count, by_tool: { Bash: count }, commands } });
  const s = summarizeRun([
    rec('jev', 'a', pd(2, ['git commit -m a', 'git push'])),
    rec('jev', 'b', pd(4, ['git commit -m a', 'git commit -m a', 'git push', 'rm -rf build'])),
    rec('full', 'a'),
  ]);
  const md = renderReport(manifest, s);
  assert.match(md, /\| turns \(median\) \|[^\n]*\n\| permission denials \(median \/ p90\) \| n\/a \/ n\/a \| 3 \/ 4 \|/);
  const section = md.slice(md.indexOf('## Denied commands'));
  assert.ok(md.indexOf('## Denied commands') > md.indexOf('## Excluded'));
  assert.match(section, /### dynamic-context \/ jev\n\n- 3 × `git commit -m a`\n- 2 × `git push`\n- 1 × `rm -rf build`/);
  assert.doesNotMatch(section, /dynamic-context \/ full/);
  const top = summarizeRun([rec('jev', 'a', pd(12, Array.from({ length: 12 }, (_, i) => `c${String(i).padStart(2, '0')}`)))]);
  assert.equal((renderReport(manifest, top).split('## Denied commands')[1].match(/^- /gm) ?? []).length, 10);
  assert.match(renderReport(manifest, summarizeRun([rec('jev', 'a')])), /## Denied commands\n\nnone\n/);
});

test('repriceAll replaces every stale cost from stored usage; applyPricing leaves a known cost alone', () => {
  const pricing = { m1: { input: 1, output: 2, cache_read: 0.5, cache_write: 1 }, orch: { input: 10, output: 0, cache_read: 0, cache_write: 0 } };
  const stale = rec('jev', 'a', { cost_usd: 99, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, per_model: { m1: { input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }, jev: { calls: 1, ok_calls: 1, reasons: {}, latency_ms_total: 1, est_tokens: 2e6, judge_usage: { m1: { input_tokens: 1e6, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }, cost_usd: 42, answers: [] } });
  const noPerModel = rec('jev', 'b', { cost_usd: 7, orchestrator_model: 'orch', usage: { input_tokens: 1e6, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, per_model: {} } });
  const failed = rec('jev', 'c', { subtype: 'failed', usage: undefined, cost_usd: undefined });
  const out = repriceAll([stale, noPerModel, failed], pricing, 0.5);
  assert.equal(out[0].cost_usd, 3);
  assert.equal(out[0].jev.cost_usd, 1 + 1);
  assert.equal(out[1].cost_usd, 10);
  assert.equal(out[2], failed);
  assert.equal(stale.cost_usd, 99);
  const kept = applyPricing([stale, noPerModel], pricing, 0.5);
  assert.equal(kept[0].cost_usd, 99);
  assert.equal(kept[0].jev.cost_usd, 42);
  assert.equal(kept[1].cost_usd, 7);
});

test('the report header says when costs were repriced', () => {
  const manifest = { run_id: 'r', date: 'd', provider: 'p', models: {}, claude_code_version: 'v', toolkit_commit: 'c' };
  const s = summarizeRun([rec('jev', 'a')]);
  assert.match(renderReport(manifest, s, { repriced: true }), /toolkit c · costs repriced from current config\n/);
  assert.doesNotMatch(renderReport(manifest, s), /repriced/);
});
