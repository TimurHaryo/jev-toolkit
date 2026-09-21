import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flagsFor, renderCard } from '../src/adapters/handback-check/card.mjs';

const thresholds = { claim: 0.8, blocker: 0.5 };
const facts = { isGitRepo: true, filesChanged: ['src/A.kt'], testFilesChanged: false, insertions: 3, deletions: 1, untracked: 0, attribution: 'snapshot' };
const n = (v) => ({ noul: v });

test('flags: tests added without test files; complete with blocker; pass with no files; mentions', () => {
  const answers = { claims_tests_run: n(0.9), claims_tests_pass: n(0.9), claims_build_ok: n(0.2), claims_tests_added: n(0.95), claims_complete: n(0.9), reports_blocker: n(0.6) };
  const flags = flagsFor({ answers, facts, thresholds, summary: 'Added tests in ATest.kt' });
  assert.deepEqual(flags, ['claims tests added; no test files changed', 'claims complete while reporting a blocker', 'mentions ATest.kt which is not in the diff']);
  const none = flagsFor({ answers: { ...answers, claims_tests_added: n(0.1), reports_blocker: n(0.1) }, facts, thresholds, summary: 'Edited src/A.kt' });
  assert.deepEqual(none, []);
  const empty = flagsFor({ answers: { ...answers, claims_tests_added: n(0.1), reports_blocker: n(0.1) }, facts: { ...facts, filesChanged: [] }, thresholds, summary: 'done' });
  assert.deepEqual(empty, ['claims tests pass; no files changed']);
});

test('null answers: only the mention rule applies', () => {
  assert.deepEqual(flagsFor({ answers: null, facts, thresholds, summary: 'Edited src/A.kt and Other.kt' }), ['mentions Other.kt which is not in the diff']);
});

test('renderCard fixed format', () => {
  const answers = { claims_tests_run: n(0.9), claims_tests_pass: n(0.85), claims_build_ok: n(0.2), claims_tests_added: n(0.05), claims_complete: n(0.9), reports_blocker: n(0.1) };
  const card = renderCard({ agentType: 'general-purpose', model: 'opus', flags: [], facts, answers });
  const lines = card.split('\n');
  assert.equal(lines[0], 'JEV hand-back check (general-purpose, opus)');
  assert.equal(lines[1], 'Flags: none');
  assert.equal(lines[2], 'Facts: files changed 1 (src/A.kt), test files changed no, +3/-1, untracked 0, attribution snapshot');
  assert.equal(lines[3], 'Claims: tests run 0.90, tests pass 0.85, build ok 0.20, tests added 0.05, complete 0.90, blocker 0.10');
  assert.equal(lines[4], 'Unverified: build ok, tests pass');
  assert.equal(lines[5], 'Read full diff: stat only is sufficient');
  const flagged = renderCard({ agentType: 'a', model: undefined, flags: ['x', 'y'], facts, answers: null, reason: 'timeout' });
  assert.match(flagged, /\(a, unknown model\)/);
  assert.match(flagged, /^Flags: x; y$/m);
  assert.match(flagged, /^Claims: unavailable \(Jev timeout\)$/m);
  assert.match(flagged, /^Read full diff: yes$/m);
  const zero = renderCard({ agentType: 'a', model: 'm', flags: ['x'], facts: { ...facts, filesChanged: [] }, answers: null, reason: 'x' });
  assert.match(zero, /files changed 0,/);
  assert.doesNotMatch(zero, /\(\)/);
});

test('facts line caps the listed paths at eight', () => {
  const many = { ...facts, filesChanged: Array.from({ length: 12 }, (_, i) => `f${i}.kt`) };
  const card = renderCard({ agentType: 'a', model: 'm', flags: [], facts: many, answers: null, reason: 'x' });
  assert.match(card, /files changed 12 \(f0\.kt, f1\.kt, f2\.kt, f3\.kt, f4\.kt, f5\.kt, f6\.kt, f7\.kt, …\)/);
});
