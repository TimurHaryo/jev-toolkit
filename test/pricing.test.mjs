import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costFromUsage, costFromModelUsage } from '../src/bench/pricing.mjs';

const pricing = { 'deepseek-chat': { input: 0.27, output: 1.10, cache_read: 0.07, cache_write: 0.27 } };
const usage = { input_tokens: 1_000_000, output_tokens: 500_000, cache_creation_input_tokens: 100_000, cache_read_input_tokens: 2_000_000 };

test('cost is tokens times per-million prices, summed by kind', () => {
  const r = costFromUsage(usage, 'deepseek-chat', pricing);
  assert.equal(r.cost_usd.toFixed(4), (0.27 + 0.55 + 0.027 + 0.14).toFixed(4));
  assert.equal(r.warning, undefined);
});

test('unknown model yields null with a warning, never a guess', () => {
  const r = costFromUsage(usage, 'mystery', pricing);
  assert.equal(r.cost_usd, null);
  assert.match(r.warning, /mystery/);
});

test('missing usage fields count as zero', () => {
  assert.equal(costFromUsage({ input_tokens: 1_000_000 }, 'deepseek-chat', pricing).cost_usd, 0.27);
});

test('per-model sum, null when any model is unpriced', () => {
  const ok = costFromModelUsage({ 'deepseek-chat': usage, 'deepseek-chat-2': usage }, { ...pricing, 'deepseek-chat-2': pricing['deepseek-chat'] });
  assert.equal(ok.cost_usd.toFixed(4), (2 * (0.27 + 0.55 + 0.027 + 0.14)).toFixed(4));
  assert.deepEqual(ok.warnings, []);
  const bad = costFromModelUsage({ 'deepseek-chat': usage, mystery: usage }, pricing);
  assert.equal(bad.cost_usd, null);
  assert.equal(bad.per_model.mystery, null);
  assert.equal(bad.warnings.length, 1);
});
