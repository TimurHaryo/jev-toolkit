import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editHash, bumpDenyCount, MAX_DENIES } from '../src/adapters/comment-policy/session-state.mjs';

test('editHash is stable and sensitive to both inputs', () => {
  assert.equal(editHash('a.kt', 'x'), editHash('a.kt', 'x'));
  assert.notEqual(editHash('a.kt', 'x'), editHash('b.kt', 'x'));
  assert.notEqual(editHash('a.kt', 'x'), editHash('a.kt', 'y'));
});

test('bumpDenyCount increments per session and hash, isolated across sessions', async () => {
  const dir = join(await mkdtemp(join(tmpdir(), 'jevss-')), 'state');
  assert.equal(await bumpDenyCount(dir, 's1', 'h'), 1);
  assert.equal(await bumpDenyCount(dir, 's1', 'h'), 2);
  assert.equal(await bumpDenyCount(dir, 's1', 'other'), 1);
  assert.equal(await bumpDenyCount(dir, 's2', 'h'), 1);
  assert.equal(MAX_DENIES, 2);
});

test('corrupt state file resets to empty', async () => {
  const dir = join(await mkdtemp(join(tmpdir(), 'jevss-')), 'state');
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 's1.json'), '{ not json');
  assert.equal(await bumpDenyCount(dir, 's1', 'h'), 1);
});

test('sessionId is sanitised to a safe filename', async () => {
  const dir = join(await mkdtemp(join(tmpdir(), 'jevss-')), 'state');
  assert.equal(await bumpDenyCount(dir, '../evil/../x', 'h'), 1);
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(dir);
  assert.equal(files.length, 1);
  assert.doesNotMatch(files[0], /\//);
});
