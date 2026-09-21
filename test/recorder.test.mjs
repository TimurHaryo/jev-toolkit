import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordingKey, recordingPath, readRecording, writeRecording } from '../src/client/recorder.mjs';

test('key is stable for equal inputs and differs when state changes', () => {
  const q = { a: { type: 'noul', instructions: 'x' } };
  assert.equal(recordingKey({ s: 1 }, q), recordingKey({ s: 1 }, q));
  assert.notEqual(recordingKey({ s: 1 }, q), recordingKey({ s: 2 }, q));
  assert.match(recordingKey({ s: 1 }, q), /^[0-9a-f]{64}$/);
});

test('recordingPath nests by area', () => {
  assert.equal(recordingPath('/r', 'comment-policy', 'abc'), join('/r', 'comment-policy', 'abc.json'));
});

test('write then read round-trips; missing returns null', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jevrec-'));
  assert.equal(await readRecording(dir, 'area', 'k1'), null);
  await writeRecording(dir, 'area', 'k1', { answers: { a: { noul: 0.1 } } });
  assert.deepEqual(await readRecording(dir, 'area', 'k1'), { answers: { a: { noul: 0.1 } } });
});
