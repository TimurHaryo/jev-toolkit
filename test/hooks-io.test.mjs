import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { readStdinJson, writeHookOutput, EXIT } from '../src/hooks/io.mjs';

test('readStdinJson parses a JSON document from a stream', async () => {
  const r = await readStdinJson(Readable.from([Buffer.from('{"a":'), Buffer.from('1}')]));
  assert.deepEqual(r, { a: 1 });
});

test('readStdinJson returns {} for empty or invalid input', async () => {
  assert.deepEqual(await readStdinJson(Readable.from([])), {});
  assert.deepEqual(await readStdinJson(Readable.from([Buffer.from('nope')])), {});
});

test('writeHookOutput writes one JSON line, or nothing for null', () => {
  let written = '';
  const out = new Writable({ write(chunk, enc, cb) { written += chunk; cb(); } });
  writeHookOutput({ x: 1 }, out);
  writeHookOutput(null, out);
  assert.equal(written, '{"x":1}\n');
});

test('EXIT codes', () => {
  assert.deepEqual(EXIT, { OK: 0, BLOCK: 2 });
});
