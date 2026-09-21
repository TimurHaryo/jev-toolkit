import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, formatReason } from '../src/adapters/comment-policy/decision.mjs';
import { RULES } from '../src/adapters/comment-policy/filters.mjs';

const thresholds = { deny: 0.8, advise: 0.5 };
const c = (line, text, kind = 'line') => ({ id: line, line, kind, text, codeAfter: '' });

test('deterministic violations alone produce deny', () => {
  const r = evaluate({ deterministic: [{ comment: c(3, '=== x ==='), rule: RULES.BANNER }], remaining: [], answers: null, thresholds });
  assert.equal(r.level, 'deny');
  assert.deepEqual(r.items, [{ line: 3, text: '=== x ===', rule: RULES.BANNER, probability: 1 }]);
});

test('narration at or above deny threshold denies; between advise and deny advises; below allows', () => {
  const remaining = [c(1, 'a'), c(2, 'b'), c(3, 'c')];
  const answers = { narrates_0: { noul: 0.85 }, narrates_1: { noul: 0.6 }, narrates_2: { noul: 0.2 }, kind_0: {}, kind_1: {}, kind_2: {} };
  const r = evaluate({ deterministic: [], remaining, answers, thresholds });
  assert.equal(r.level, 'deny');
  assert.deepEqual(r.items.map((i) => [i.line, i.rule, i.probability]), [[1, RULES.NARRATION, 0.85], [2, RULES.NARRATION, 0.6]]);
});

test('only mid-band items produce advise', () => {
  const r = evaluate({ deterministic: [], remaining: [c(1, 'a')], answers: { narrates_0: { noul: 0.55 } }, thresholds });
  assert.equal(r.level, 'advise');
});

test('kdoc restating the signature is its own rule', () => {
  const r = evaluate({ deterministic: [], remaining: [c(4, 'Returns id', 'kdoc')], answers: { narrates_0: { noul: 0.1 }, restates_signature_0: { noul: 0.9 } }, thresholds });
  assert.equal(r.level, 'deny');
  assert.equal(r.items[0].rule, RULES.RESTATES_SIGNATURE);
});

test('null answers with nothing deterministic allows', () => {
  const r = evaluate({ deterministic: [], remaining: [c(1, 'a')], answers: null, thresholds });
  assert.deepEqual(r, { level: 'allow', items: [] });
});

test('formatReason lists each item with line, rule, and the policy line', () => {
  const s = formatReason('deny', [{ line: 3, text: 'increment counter', rule: RULES.NARRATION, probability: 0.9 }]);
  assert.match(s, /line 3/);
  assert.match(s, /narration/);
  assert.match(s, /increment counter/);
  assert.match(s, /explain why, never what/);
  assert.match(s, /0\.90/);
});
