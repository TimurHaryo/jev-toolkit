import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectSections, renderContext } from '../src/adapters/dynamic-context/sections.mjs';
import { readInjected, markInjected } from '../src/adapters/dynamic-context/session-state.mjs';

const sections = [
  { id: 'a', body: 'A'.repeat(400) },   // ~100 tokens
  { id: 'b', body: 'B'.repeat(400) },
  { id: 'c', body: 'C'.repeat(400) },
];
const answers = { relevant_a: { noul: 0.9 }, relevant_b: { noul: 0.7 }, relevant_c: { noul: 0.2 } };

test('selects above threshold, ordered by probability, excluding already injected', () => {
  assert.deepEqual(selectSections({ answers, sections, threshold: 0.5, budgetTokens: 6000, alreadyInjected: new Set() }), ['a', 'b']);
  assert.deepEqual(selectSections({ answers, sections, threshold: 0.5, budgetTokens: 6000, alreadyInjected: new Set(['a']) }), ['b']);
});

test('budget cuts the lowest-probability sections first', () => {
  assert.deepEqual(selectSections({ answers, sections, threshold: 0.1, budgetTokens: 150, alreadyInjected: new Set() }), ['a']);
  assert.deepEqual(selectSections({ answers, sections, threshold: 0.1, budgetTokens: 250, alreadyInjected: new Set() }), ['a', 'b']);
});

test('missing answers are treated as not relevant', () => {
  assert.deepEqual(selectSections({ answers: {}, sections, threshold: 0.5, budgetTokens: 6000, alreadyInjected: new Set() }), []);
});

test('renderContext has the header and each body', () => {
  const out = renderContext([sections[0], sections[1]]);
  assert.ok(out.startsWith('Project rules selected for this task (JEV):\n\n'));
  assert.match(out, /AAAA/);
  assert.match(out, /BBBB/);
});

test('session state round-trips and tolerates a corrupt file', async () => {
  const dir = join(await mkdtemp(join(tmpdir(), 'jevdc-')), 'state');
  assert.deepEqual([...(await readInjected(dir, 's1'))], []);
  await markInjected(dir, 's1', ['a', 'b']);
  await markInjected(dir, 's1', ['b', 'c']);
  assert.deepEqual([...(await readInjected(dir, 's1'))].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...(await readInjected(dir, 's2'))], []);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(dir, 's3.json'), '{ nope');
  assert.deepEqual([...(await readInjected(dir, 's3'))], []);
});
