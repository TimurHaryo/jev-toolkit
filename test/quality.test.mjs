import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { goldSectionsScore, readInjected, handbackSignals, readFullDiffAfterAgent } from '../src/bench/quality.mjs';
import { parseStream } from '../src/bench/claude-run.mjs';
import { toolkitRoot } from '../src/client/config.mjs';

test('gold section recall and precision', () => {
  assert.deepEqual(goldSectionsScore(['compose', 'room'], ['compose', 'testing']), { recall: 0.5, precision: 0.5 });
  assert.deepEqual(goldSectionsScore([], ['compose']), { recall: 0, precision: null });
  assert.deepEqual(goldSectionsScore(['compose'], []), { recall: null, precision: 0 });
});

test('readInjected reads the hook state file or returns []', async () => {
  const logDir = await mkdtemp(join(tmpdir(), 'jevq-'));
  await mkdir(join(logDir, 'state', 'dynamic-context'), { recursive: true });
  await writeFile(join(logDir, 'state', 'dynamic-context', 'sess-1.json'), JSON.stringify({ injected: ['compose'] }));
  assert.deepEqual(await readInjected(logDir, 'sess-1'), ['compose']);
  assert.deepEqual(await readInjected(logDir, 'nope'), []);
});

test('handbackSignals counts new cards and raised flags', async () => {
  const cards = await mkdtemp(join(tmpdir(), 'jevcards-'));
  await writeFile(join(cards, 'old.card.md'), 'JEV hand-back check (a, m)\nFlags: none\n');
  const before = new Set(['old.card.md']);
  await writeFile(join(cards, 'tu1.card.md'), 'JEV hand-back check (a, m)\nFlags: claims tests added; no test files changed\n');
  await writeFile(join(cards, 'tu2.card.md'), 'JEV hand-back check (a, m)\nFlags: none\n');
  assert.deepEqual(await handbackSignals(cards, before), { cards: 2, flags_raised: 1 });
  assert.deepEqual(await handbackSignals(join(cards, 'missing'), new Set()), { cards: 0, flags_raised: 0 });
});

test('readFullDiffAfterAgent finds a git diff after the Agent result', async () => {
  const { events } = parseStream(await readFile(join(toolkitRoot(), 'test', 'fixtures', 'bench', 'stream.jsonl'), 'utf8'));
  assert.equal(readFullDiffAfterAgent(events), true);
  const noDiff = events.filter((e) => !(e.type === 'assistant' && JSON.stringify(e).includes('git diff')));
  assert.equal(readFullDiffAfterAgent(noDiff), false);
  assert.equal(readFullDiffAfterAgent(events.filter((e) => e.type === 'result')), null);
});
