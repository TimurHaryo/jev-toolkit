import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compareCase, summarize, formatReport } from '../src/bench/accuracy.mjs';
import { toolkitRoot } from '../src/client/config.mjs';

test('fixture file has 40 well-formed cases', async () => {
  const lines = (await readFile(join(toolkitRoot(), 'fixtures', 'comment-policy', 'cases.jsonl'), 'utf8')).trim().split('\n');
  assert.equal(lines.length, 40);
  for (const l of lines) {
    const c = JSON.parse(l);
    assert.equal(c.state.comments.length, 1);
    assert.equal(typeof c.expected.narrates_0, 'boolean');
    assert.equal(typeof c.expected.kind_0, 'string');
    if (c.state.comments[0].kind === 'kdoc') assert.equal(typeof c.expected.restates_signature_0, 'boolean');
  }
});

test('compareCase handles noul and choice', () => {
  const rows = compareCase({ narrates_0: true, kind_0: 'narration' }, { narrates_0: { noul: 0.9 }, kind_0: { choice: 'reason', confidence: 0.7 } });
  assert.deepEqual(rows, [
    { id: 'narrates_0', expected: true, predicted: true, correct: true, confidence: 0.9 },
    { id: 'kind_0', expected: 'narration', predicted: 'reason', correct: false, confidence: 0.7 },
  ]);
  assert.equal(compareCase({ narrates_0: false }, { narrates_0: { noul: 0.3 } })[0].confidence, 0.7);
});

test('summarize computes agreement, per-question precision/recall, and buckets', () => {
  const rows = [
    { id: 'narrates_0', expected: true, predicted: true, correct: true, confidence: 0.95 },
    { id: 'narrates_0', expected: false, predicted: true, correct: false, confidence: 0.55 },
    { id: 'narrates_0', expected: true, predicted: false, correct: false, confidence: 0.65 },
    { id: 'narrates_0', expected: false, predicted: false, correct: true, confidence: 0.85 },
    { id: 'kind_0', expected: 'reason', predicted: 'reason', correct: true, confidence: 0.75 },
  ];
  const s = summarize(rows);
  assert.equal(s.agreement, 0.6);
  assert.equal(s.byQuestion.narrates.n, 4);
  assert.equal(s.byQuestion.narrates.precision, 0.5);
  assert.equal(s.byQuestion.narrates.recall, 0.5);
  assert.equal(s.byQuestion.kind.n, 1);
  const b = Object.fromEntries(s.buckets.map((x) => [x.range, x]));
  assert.equal(b['0.9-1.0'].accuracy, 1);
  assert.equal(b['0.5-0.6'].accuracy, 0);
  assert.equal(b['0.6-0.7'].n, 1);
});

test('formatReport mentions area, agreement, and skipped reasons', () => {
  const s = summarize([{ id: 'narrates_0', expected: true, predicted: true, correct: true, confidence: 0.9 }]);
  const t = formatReport('comment-policy', s, [{ index: 3, reason: 'no_recording' }]);
  assert.match(t, /comment-policy/);
  assert.match(t, /agreement: 100\.0%/);
  assert.match(t, /skipped 1/);
  assert.match(t, /no_recording/);
});

test('decisionCost: jev estimates input tokens and prices them per million', async () => {
  const { decisionCost } = await import('../src/bench/accuracy.mjs');
  const { estimateTokens } = await import('../src/client/tokens.mjs');
  const state = { comments: [{ text: 'x' }] };
  const questions = { q: { type: 'noul' } };
  const c = decisionCost({ judge: 'jev', result: { ok: true, meta: { latencyMs: 40 } }, state, questions, jevPricePerMTok: 0.042 });
  const tokens = estimateTokens({ state, questions });
  assert.deepEqual(c, { latencyMs: 40, inputTokens: tokens, outputTokens: 0, costUsd: (tokens * 0.042) / 1e6, warning: null });
});

test('decisionCost: llm and api price usage from the provider table; unpriced is null with a warning', async () => {
  const { decisionCost } = await import('../src/bench/accuracy.mjs');
  const result = { ok: true, meta: { latencyMs: 900, usage: { input_tokens: 1000, output_tokens: 100 } } };
  const pricing = { h: { input: 1, output: 5 } };
  const c = decisionCost({ judge: 'api', result, model: 'h', pricing });
  assert.equal(c.latencyMs, 900);
  assert.equal(c.inputTokens, 1000);
  assert.equal(c.outputTokens, 100);
  assert.ok(Math.abs(c.costUsd - 0.0015) < 1e-12);
  assert.equal(c.warning, null);
  const u = decisionCost({ judge: 'llm', result, model: 'zzz', pricing });
  assert.equal(u.costUsd, null);
  assert.match(u.warning, /no price for zzz/);
  assert.equal(decisionCost({ judge: 'api', result: { ok: false, reason: 'api_timeout' }, model: 'h', pricing }), null);
});

test('formatCostBlock: median, p90, totals, and the est / replay / n/a markers', async () => {
  const { formatCostBlock } = await import('../src/bench/accuracy.mjs');
  const costs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((latencyMs) => ({ latencyMs, inputTokens: 100, outputTokens: 0, costUsd: 0.000001, warning: null }));
  assert.equal(formatCostBlock(costs, { judge: 'jev', mode: 'replay' }), 'decisions 10 · latency ms median 55 / p90 90 (replay) · input tokens 1000 (est) · output tokens 0 · cost USD 0.000010');
  assert.equal(formatCostBlock(costs.slice(0, 3), { judge: 'jev', mode: 'live' }), 'decisions 3 · latency ms median 20 / p90 30 · input tokens 300 (est) · output tokens 0 · cost USD 0.000003');
  const api = [{ latencyMs: 800, inputTokens: 500, outputTokens: 40, costUsd: null, warning: 'no price for h' }, { latencyMs: 1200, inputTokens: 500, outputTokens: 60, costUsd: 0.001, warning: null }];
  assert.equal(formatCostBlock(api, { judge: 'api', mode: 'replay' }), 'decisions 2 · latency ms median 1000 / p90 1200 · input tokens 1000 · output tokens 100 · cost USD n/a\nwarning: no price for h');
  assert.equal(formatCostBlock([], { judge: 'api' }), 'decisions 0 · latency ms median n/a / p90 n/a · input tokens 0 · output tokens 0 · cost USD 0.000000');
});

test('dumpLine: one JSON-ready object per case with the compared rows', async () => {
  const { dumpLine } = await import('../src/bench/accuracy.mjs');
  const rows = compareCase({ narrates_0: true }, { narrates_0: { noul: 0.9 } });
  assert.deepEqual(dumpLine({ index: 2, result: { ok: true, meta: { latencyMs: 12 } }, rows }), { index: 2, ok: true, latencyMs: 12, rows: [{ id: 'narrates_0', expected: true, predicted: true, confidence: 0.9, correct: true }] });
  assert.deepEqual(dumpLine({ index: 3, result: { ok: false, reason: 'api_timeout' }, rows: [] }), { index: 3, ok: false, reason: 'api_timeout', latencyMs: null, rows: [] });
});

test('llm judge input tokens include cached prompt tokens', async () => {
  const { decisionCost } = await import('../src/bench/accuracy.mjs');
  const c = decisionCost({ judge: 'llm', result: { ok: true, meta: { latencyMs: 10, usage: { input_tokens: 5, cache_read_input_tokens: 20000, cache_creation_input_tokens: 100, output_tokens: 30 } } }, model: 'm', pricing: {} });
  assert.equal(c.inputTokens, 20105);
});

test('dump lines carry the parse detail and raw reply of a failed decision', async () => {
  const { dumpLine } = await import('../src/bench/accuracy.mjs');
  const line = dumpLine({ index: 3, result: { ok: false, reason: 'judge_parse', detail: 'x: bad', raw: 'Sure! {' }, rows: [] });
  assert.equal(line.detail, 'x: bad');
  assert.equal(line.raw, 'Sure! {');
});
