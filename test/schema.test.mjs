import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noul, choice, score, buildRequest, validateAnswers } from '../src/client/schema.mjs';

const questions = {
  urgent: noul('Is it urgent?', { true: 'Deadline today', false: 'No deadline' }),
  dept: choice('Which team?', { billing: 'Money', tech: 'Bugs', other: null }),
  severity: score('How bad?', ['Cosmetic', 'Degraded', 'Blocking']),
};

test('builders produce the documented shapes', () => {
  assert.deepEqual(questions.urgent, { type: 'noul', instructions: 'Is it urgent?', criteria: { true: 'Deadline today', false: 'No deadline' } });
  assert.deepEqual(noul('x'), { type: 'noul', instructions: 'x' });
  assert.equal(questions.dept.type, 'choice');
  assert.deepEqual(questions.severity.criteria, ['Cosmetic', 'Degraded', 'Blocking']);
});

test('buildRequest carries model, state and questions verbatim', () => {
  const req = buildRequest({ model: 'jev-1.13.0', state: { a: 1 }, questions });
  assert.deepEqual(req, { model: 'jev-1.13.0', state: { a: 1 }, questions });
});

test('validateAnswers accepts a well-formed body', () => {
  const body = { answers: {
    urgent: { type: 'noul', noul: 0.93 },
    dept: { type: 'choice', choice: 'tech', probabilities: { billing: 0.1, tech: 0.8, other: 0.1 }, confidence: 0.7 },
    severity: { type: 'score', score: 1.4, probabilities: [0.1, 0.4, 0.5], confidence: 0.6 },
  } };
  const r = validateAnswers(questions, body);
  assert.equal(r.ok, true);
  assert.equal(r.answers.dept.choice, 'tech');
});

test('validateAnswers rejects missing question, out-of-range noul, unknown choice', () => {
  assert.equal(validateAnswers(questions, { answers: {} }).ok, false);
  assert.equal(validateAnswers(questions, { answers: { urgent: { noul: 1.5 }, dept: { choice: 'tech', probabilities: {}, confidence: 1 }, severity: { score: 1, probabilities: [], confidence: 1 } } }).ok, false);
  const bad = validateAnswers(questions, { answers: { urgent: { noul: 0.5 }, dept: { choice: 'nope', probabilities: {}, confidence: 1 }, severity: { score: 1, probabilities: [], confidence: 1 } } });
  assert.equal(bad.ok, false);
  assert.match(bad.detail, /dept/);
});

test('validateAnswers rejects a non-object body', () => {
  assert.equal(validateAnswers(questions, null).ok, false);
  assert.equal(validateAnswers(questions, 'text').ok, false);
});
