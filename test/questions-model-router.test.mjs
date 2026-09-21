import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as area from '../src/questions/model-router.mjs';

test('contract: choice over three tiers plus two nouls', () => {
  assert.equal(area.version, '1');
  assert.deepEqual(area.thresholds, { confidence: 0.6 });
  assert.deepEqual(area.TIERS, ['haiku', 'sonnet', 'opus']);
  const q = area.buildQuestions({ brief: 'Find which module owns FrameStore' });
  assert.deepEqual(Object.keys(q).sort(), ['asks_for_change', 'needs_broad_exploration', 'tier']);
  assert.equal(q.tier.type, 'choice');
  assert.deepEqual(Object.keys(q.tier.criteria), ['haiku', 'sonnet', 'opus']);
  for (const v of Object.values(q.tier.criteria)) assert.ok(v.length > 30);
  assert.match(q.tier.instructions, /`brief`/);
  assert.equal(q.needs_broad_exploration.type, 'noul');
  assert.equal(q.asks_for_change.type, 'noul');
});

test('truncate cuts the brief', () => {
  assert.equal(area.truncate({ brief: 'x'.repeat(20000) }).brief.length, area.MAX_BRIEF_CHARS);
});
