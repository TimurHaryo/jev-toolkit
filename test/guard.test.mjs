import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedRoot, assertAllowedRoot, NotAllowedRoot } from '../src/client/guard.mjs';

test('cwd equal to a root is allowed', () => {
  assert.equal(isAllowedRoot('/a/b', ['/a/b']), true);
});

test('cwd inside a root is allowed, sibling with shared prefix is not', () => {
  assert.equal(isAllowedRoot('/a/b/c', ['/a/b']), true);
  assert.equal(isAllowedRoot('/a/bc', ['/a/b']), false);
});

test('empty roots allow nothing', () => {
  assert.equal(isAllowedRoot('/a', []), false);
});

test('relative paths and trailing slashes are normalised', () => {
  assert.equal(isAllowedRoot('/a/b/./c', ['/a/b/']), true);
});

test('relative roots never match', () => {
  assert.equal(isAllowedRoot(process.cwd(), ['.']), false);
  assert.equal(isAllowedRoot(process.cwd(), ['']), false);
});

test('assertAllowedRoot throws NotAllowedRoot with code', () => {
  assert.throws(() => assertAllowedRoot('/x', ['/a']), (e) => e instanceof NotAllowedRoot && e.code === 'not_allowed_root');
});
