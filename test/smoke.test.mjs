import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSmokeRequest, formatSmokeReport } from '../src/client/smoke.mjs';
import { validateAnswers } from '../src/client/schema.mjs';

test('smoke request has one of each primitive and the pinned model', () => {
  const req = buildSmokeRequest('jev-1.13.0');
  assert.equal(req.model, 'jev-1.13.0');
  assert.equal(typeof req.state, 'string');
  const types = Object.values(req.questions).map((q) => q.type).sort();
  assert.deepEqual(types, ['choice', 'noul', 'score']);
});

test('report passes on a valid body and prints usage when present', () => {
  const req = buildSmokeRequest('m');
  const body = { answers: {
    is_blue: { type: 'noul', noul: 0.99 },
    color: { type: 'choice', choice: 'blue', probabilities: { blue: 0.9, red: 0.05, other: 0.05 }, confidence: 0.9 },
    certainty: { type: 'score', score: 1.9, probabilities: [0.02, 0.06, 0.92], confidence: 0.9 },
  }, usage: { input_tokens: 40 } };
  const r = formatSmokeReport({ status: 200, body, text: JSON.stringify(body), validation: validateAnswers(req.questions, body), latencyMs: 120, mode: 'live', allowedRoots: ['/x'] });
  assert.equal(r.ok, true);
  assert.match(r.text, /PASS/);
  assert.match(r.text, /input_tokens/);
  assert.match(r.text, /120 ms/);
  assert.match(r.text, /mode: live/);
  assert.match(r.text, /allowedRoots: \["\/x"\]/);
});

test('report fails on schema mismatch with a paste-back block', () => {
  const req = buildSmokeRequest('m');
  const body = { answers: { is_blue: { noul: 3 } } };
  const r = formatSmokeReport({ status: 200, body, text: JSON.stringify(body), validation: validateAnswers(req.questions, body), latencyMs: 90, mode: 'live', allowedRoots: ['/x'] });
  assert.equal(r.ok, false);
  assert.match(r.text, /PASTE THIS BACK/);
  assert.match(r.text, /is_blue/);
});

test('report fails on non-2xx', () => {
  const req = buildSmokeRequest('m');
  const r = formatSmokeReport({ status: 401, body: null, text: 'unauthorized', validation: validateAnswers(req.questions, null), latencyMs: 50, mode: 'live', allowedRoots: ['/x'] });
  assert.equal(r.ok, false);
  assert.match(r.text, /401/);
  assert.match(r.text, /unauthorized/);
});
