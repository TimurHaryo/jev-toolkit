import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as area from '../src/questions/handback-check.mjs';

test('contract and six nouls about the summary only', () => {
  assert.equal(area.version, '1');
  assert.deepEqual(area.thresholds, { claim: 0.8, blocker: 0.5 });
  const q = area.buildQuestions({ summary: 'Added tests, all green', agent_type: 'general-purpose' });
  assert.deepEqual(Object.keys(q).sort(), ['claims_build_ok', 'claims_complete', 'claims_tests_added', 'claims_tests_pass', 'claims_tests_run', 'reports_blocker']);
  for (const v of Object.values(q)) { assert.equal(v.type, 'noul'); assert.match(v.instructions, /`summary`/); }
});

test('truncate cuts the summary', () => {
  assert.equal(area.truncate({ summary: 'x'.repeat(20000), agent_type: 'a' }).summary.length, area.MAX_SUMMARY_CHARS);
});
