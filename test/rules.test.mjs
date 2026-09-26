import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRules } from '../src/targets/rules.mjs';
import { toolkitRoot } from '../src/client/config.mjs';
import { findBanned } from './helpers/banned-terms.mjs';

test('loads .md files in filename order and ignores others', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jevrules-'));
  await writeFile(join(dir, '10-b.md'), '---\nid: b\nsummary: B\n---\nbody b');
  await writeFile(join(dir, '00-a.md'), '---\nid: a\nalways: true\n---\nbody a');
  await writeFile(join(dir, 'notes.txt'), 'ignored');
  const rules = await loadRules(dir);
  assert.deepEqual(rules.map((r) => r.id), ['a', 'b']);
  assert.equal(rules[0].always, true);
  assert.equal(rules[1].body, 'body b');
  assert.equal(rules[1].file, '10-b.md');
});

test('the shipped websocket-inspector rules load with exactly one always-on core section and unique ids', async () => {
  const rules = await loadRules(join(toolkitRoot(), 'targets', 'websocket-inspector', 'rules'));
  assert.equal(rules.length, 11);
  assert.deepEqual(rules.filter((r) => r.always).map((r) => r.id), ['core']);
  assert.equal(new Set(rules.map((r) => r.id)).size, 11);
  for (const r of rules) {
    assert.ok(r.summary.length > 10 || r.always, `${r.id} needs a summary`);
    assert.equal(findBanned(r.body + r.summary), null, `${r.id} mentions a banned term`);
  }
  assert.deepEqual(rules.find((r) => r.id === 'git').paths, []);
});
