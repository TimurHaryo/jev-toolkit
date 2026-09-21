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
