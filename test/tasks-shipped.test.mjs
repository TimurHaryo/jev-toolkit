import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { loadTasks } from '../src/bench/tasks.mjs';
import { loadRules } from '../src/targets/rules.mjs';
import { toolkitRoot } from '../src/client/config.mjs';

test('fifteen shipped tasks with valid labels', async () => {
  const tasks = await loadTasks(join(toolkitRoot(), 'targets', 'websocket-inspector', 'tasks'));
  const ids = new Set((await loadRules(join(toolkitRoot(), 'targets', 'websocket-inspector', 'rules'))).map((r) => r.id));
  assert.equal(tasks.length, 15);
  const counts = {};
  for (const t of tasks) {
    counts[t.category] = (counts[t.category] ?? 0) + 1;
    assert.ok(['haiku', 'sonnet', 'opus'].includes(t.gold_tier), t.id);
    for (const s of t.gold_sections) assert.ok(ids.has(s), `${t.id}: ${s}`);
    assert.ok(t.prompt.trim().length > 40, t.id);
    assert.equal(/workapp/i.test(t.prompt), false, t.id);
    if (t.needs_subagent) assert.match(t.prompt, /subagent in the foreground/);
    if (t.id !== '15-compile-check') assert.match(t.prompt, /Do not run Gradle|Change nothing/);
  }
  assert.deepEqual(counts, { 'one-file': 5, 'comment-heavy': 4, 'multi-file': 3, info: 3 });
  assert.equal(tasks.filter((t) => t.needs_subagent).length, 3);
});
