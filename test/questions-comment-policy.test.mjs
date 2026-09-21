import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as area from '../src/questions/comment-policy.mjs';

const state = { comments: [
  { id: 0, text: 'increment counter', kind: 'line', code_after: 'counter++' },
  { id: 1, text: 'Returns the user id\n@param id the id', kind: 'kdoc', code_after: 'fun userId(id: String): String' },
] };

test('exports the area contract', () => {
  assert.equal(area.version, '1');
  assert.deepEqual(area.thresholds, { deny: 0.8, advise: 0.5 });
  assert.equal(area.MAX_COMMENTS, 20);
});

test('builds narrates and kind for every comment, restates_signature for kdoc only', () => {
  const q = area.buildQuestions(state);
  assert.deepEqual(Object.keys(q).sort(), ['kind_0', 'kind_1', 'narrates_0', 'narrates_1', 'restates_signature_1']);
  assert.equal(q.narrates_0.type, 'noul');
  assert.ok(q.narrates_0.criteria.true.length > 20);
  assert.ok(q.narrates_0.criteria.false.length > 20);
  assert.match(q.narrates_0.instructions, /`comments\[0\]/);
  assert.equal(q.kind_0.type, 'choice');
  assert.deepEqual(Object.keys(q.kind_0.criteria), ['narration', 'reason', 'public_summary', 'todo', 'other']);
  assert.equal(q.kind_0.criteria.other, null);
});

test('truncate caps comment count and code_after length', () => {
  const many = { comments: Array.from({ length: 30 }, (_, i) => ({ id: i, text: 't', kind: 'line', code_after: 'x'.repeat(500) })) };
  const t = area.truncate(many);
  assert.equal(t.comments.length, 20);
  assert.equal(t.comments[0].code_after.length, 200);
});
