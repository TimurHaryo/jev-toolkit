import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assessProbes, PROBES } from '../src/bench/hooks-check.mjs';

test('three probes, in order, with the agent probe demanding a foreground subagent', () => {
  assert.deepEqual(PROBES.map((p) => p.name), ['context', 'comment', 'agent']);
  assert.match(PROBES[2].prompt, /in the foreground/);
});

test('assessProbes reports each hook from the logs and cards', async () => {
  const logDir = await mkdtemp(join(tmpdir(), 'jevhc-'));
  await mkdir(join(logDir, 'handback'), { recursive: true });
  await writeFile(join(logDir, 'dynamic-context.jsonl'), JSON.stringify({ sessionId: 's1', ok: true }) + '\n');
  await writeFile(join(logDir, 'comment-policy.jsonl'), JSON.stringify({ sessionId: 's2', ok: false, reason: 'no_api_key' }) + '\n');
  await writeFile(join(logDir, 'handback', 'tu9.card.md'), 'JEV hand-back check (general-purpose, m)\nFlags: none\nFacts: files changed 0, test files changed no, +0/-0, untracked 0, attribution snapshot\n');
  const { checks } = await assessProbes({ logDir, sessions: { context: 's1', comment: 's2', agent: 's3' }, cardsBefore: new Set() });
  const byName = Object.fromEntries(checks.map((c) => [c.name, c]));
  assert.equal(byName['dynamic-context hook fired'].ok, true);
  assert.equal(byName['dynamic-context Jev call ok'].ok, true);
  assert.equal(byName['comment-policy hook fired'].ok, true);
  assert.equal(byName['comment-policy Jev call ok'].ok, false);
  assert.match(byName['comment-policy Jev call ok'].detail, /no_api_key/);
  assert.equal(byName['hand-back card produced'].ok, true);
  assert.equal(byName['hand-back card has facts'].ok, true);
  const none = await assessProbes({ logDir, sessions: { context: 'x', comment: 'y', agent: 'z' }, cardsBefore: new Set(['tu9.card.md']) });
  assert.ok(none.checks.every((c) => c.ok === false));
});
