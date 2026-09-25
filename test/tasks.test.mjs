import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTasks, armFileFor } from '../src/bench/tasks.mjs';

test('loadTasks parses frontmatter lists and booleans and keeps the prompt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jevtasks-'));
  await writeFile(join(dir, '02-b.md'), '---\nid: 02-b\ncategory: info\ngold_sections:\n  - room\ngold_tier: haiku\nexpect_files: []\nneeds_subagent: false\n---\nWhat is the DB version?\n');
  await writeFile(join(dir, '01-a.md'), '---\nid: 01-a\ncategory: multi-file\ngold_sections:\n  - websocket\n  - coroutines\ngold_tier: opus\nexpect_files:\n  - "inspector/**/Chucker*.kt"\nneeds_subagent: true\n---\nDo the thing.\n');
  const all = await loadTasks(dir);
  assert.deepEqual(all.map((t) => t.id), ['01-a', '02-b']);
  assert.deepEqual(all[0].gold_sections, ['websocket', 'coroutines']);
  assert.equal(all[0].needs_subagent, true);
  assert.equal(all[1].needs_subagent, false);
  assert.deepEqual(all[1].expect_files, []);
  assert.equal(all[1].prompt, 'What is the DB version?\n');
  assert.deepEqual((await loadTasks(dir, ['02-b'])).map((t) => t.id), ['02-b']);
  await assert.rejects(loadTasks(dir, ['nope']), /unknown task/);
});

test('armFileFor maps area and arm to a file name', () => {
  assert.equal(armFileFor('dynamic-context', 'jev'), 'dynamic-context-jev.json');
  assert.equal(armFileFor('comment-policy', 'llm'), 'comment-policy-llm.json');
  assert.equal(armFileFor('handback', 'always'), 'handback-always.json');
  assert.throws(() => armFileFor('handback', 'native'), /unknown/);
  assert.throws(() => armFileFor('router', 'jev'), /unknown/);
});
