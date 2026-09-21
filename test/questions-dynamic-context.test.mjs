import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as area from '../src/questions/dynamic-context.mjs';

const state = { prompt: 'Add a dark preview to SocketListScreen', sections: [{ id: 'compose', summary: 'Compose rules' }, { id: 'room', summary: 'Room rules' }] };

test('contract and one noul per section referencing the summary', () => {
  assert.equal(area.version, '1');
  assert.deepEqual(area.thresholds, { relevant: 0.5 });
  const q = area.buildQuestions(state);
  assert.deepEqual(Object.keys(q), ['relevant_compose', 'relevant_room']);
  assert.equal(q.relevant_compose.type, 'noul');
  assert.match(q.relevant_compose.instructions, /`sections\[0\]`/);
  assert.ok(q.relevant_compose.criteria.true.length > 20);
});

test('truncate cuts the prompt only', () => {
  const t = area.truncate({ prompt: 'x'.repeat(9000), sections: state.sections });
  assert.equal(t.prompt.length, area.MAX_PROMPT_CHARS);
  assert.deepEqual(t.sections, state.sections);
});
