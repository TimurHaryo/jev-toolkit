import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters, RULES } from '../src/adapters/comment-policy/filters.mjs';

const c = (text, kind = 'line') => ({ id: 0, line: 1, kind, text, codeAfter: '' });

test('markers and TODO/FIXME are skipped entirely', () => {
  const r = applyFilters([c('does the thing jev:allow'), c('TODO: later'), c('FIXME broken')]);
  assert.deepEqual(r, { deterministic: [], remaining: [] });
});

test('banners are deterministic violations', () => {
  const r = applyFilters([c('==== HELPERS ===='), c('-----'), c('*****  section  *****')]);
  assert.equal(r.deterministic.length, 3);
  assert.ok(r.deterministic.every((d) => d.rule === RULES.BANNER));
});

test('commented-out code is detected by trailing brace/semicolon or leading keyword', () => {
  const r = applyFilters([c('val x = compute()'), c('if (a) {'), c('}'), c('foo();'), c('return result'), c('@Inject lateinit var x: Y'), c('override fun onStart() {')]);
  assert.equal(r.deterministic.length, 7);
  assert.ok(r.deterministic.every((d) => d.rule === RULES.COMMENTED_OUT));
});

test('step numbering is a deterministic violation', () => {
  const r = applyFilters([c('Step 1: load data'), c('1. parse'), c('2) map')]);
  assert.equal(r.deterministic.length, 3);
  assert.ok(r.deterministic.every((d) => d.rule === RULES.STEP));
});

test('ordinary prose goes to remaining', () => {
  const r = applyFilters([c('Retry once because the socket drops the first frame after resume'), c('increment counter')]);
  assert.equal(r.deterministic.length, 0);
  assert.equal(r.remaining.length, 2);
});

test('prose that opens with a control keyword is not commented-out code', () => {
  const prose = applyFilters([
    c('when the socket resumes, retry the handshake once'),
    c('for large payloads the encoder buffers before framing'),
    c('if the token is stale the retry path re-auths first'),
    c('return early when the list is empty'),
  ]);
  assert.equal(prose.deterministic.length, 0);
  assert.equal(prose.remaining.length, 4);

  const code = applyFilters([c('while (running) {'), c('return result'), c('when (state) {')]);
  assert.equal(code.deterministic.length, 3);
  assert.ok(code.deterministic.every((d) => d.rule === RULES.COMMENTED_OUT));
});
