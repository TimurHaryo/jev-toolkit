import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens } from '../src/client/tokens.mjs';

test('strings estimate at one token per four characters, rounded up', () => {
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2);
  assert.equal(estimateTokens(''), 0);
});

test('objects are measured as their JSON', () => {
  assert.equal(estimateTokens({ a: 1 }), Math.ceil('{"a":1}'.length / 4));
});
