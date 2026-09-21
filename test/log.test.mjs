import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendLog } from '../src/client/log.mjs';

test('appendLog creates the dir and appends one JSON line per call', async () => {
  const dir = join(await mkdtemp(join(tmpdir(), 'jevlog-')), 'nested');
  await appendLog(dir, 'area', { a: 1 });
  await appendLog(dir, 'area', { b: 2 });
  const lines = (await readFile(join(dir, 'area.jsonl'), 'utf8')).trim().split('\n');
  assert.deepEqual(lines.map((l) => JSON.parse(l)), [{ a: 1 }, { b: 2 }]);
});
