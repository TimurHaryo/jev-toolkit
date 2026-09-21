import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summaryFromResponse } from '../src/adapters/handback-check/response.mjs';

test('a string response is its own summary', () => {
  assert.equal(summaryFromResponse('done'), 'done');
});

test('an array response joins the text of its text parts', () => {
  assert.equal(summaryFromResponse([{ type: 'text', text: 'a' }, { type: 'image', source: {} }, 'b']), 'a\nb');
  assert.equal(summaryFromResponse([]), '');
});

test('an object with content recurses into it', () => {
  assert.equal(summaryFromResponse({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }), 'a\nb');
  assert.equal(summaryFromResponse({ content: 'plain' }), 'plain');
});

test('an object with a result or text string uses it', () => {
  assert.equal(summaryFromResponse({ result: 'r' }), 'r');
  assert.equal(summaryFromResponse({ text: 't' }), 't');
});

test('any other object is stringified and capped at 12000 chars', () => {
  assert.equal(summaryFromResponse({ a: 1 }), '{"a":1}');
  assert.equal(summaryFromResponse({ a: 'x'.repeat(20000) }).length, 12000);
});

test('null and undefined are empty', () => {
  assert.equal(summaryFromResponse(null), '');
  assert.equal(summaryFromResponse(undefined), '');
});
