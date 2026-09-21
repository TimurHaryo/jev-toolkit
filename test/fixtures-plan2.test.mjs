import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { toolkitRoot } from '../src/client/config.mjs';
import { loadRules } from '../src/targets/rules.mjs';

async function cases(area) {
  const text = await readFile(join(toolkitRoot(), 'fixtures', area, 'cases.jsonl'), 'utf8');
  return text.trim().split('\n').map((l) => JSON.parse(l));
}

test('dynamic-context: 20 cases, identical section list matching the shipped rules, one boolean per section', async () => {
  const rules = (await loadRules(join(toolkitRoot(), 'targets', 'websocket-inspector', 'rules'))).filter((r) => !r.always);
  const expectedSections = rules.map((r) => ({ id: r.id, summary: r.summary }));
  const cs = await cases('dynamic-context');
  assert.equal(cs.length, 20);
  for (const c of cs) {
    assert.deepEqual(c.state.sections, expectedSections);
    assert.ok(c.state.prompt.length > 10);
    assert.deepEqual(Object.keys(c.expected).sort(), rules.map((r) => `relevant_${r.id}`).sort());
    assert.ok(Object.values(c.expected).some(Boolean), c.state.prompt);
  }
});

test('handback-check: 25 cases with six booleans each', async () => {
  const cs = await cases('handback-check');
  assert.equal(cs.length, 25);
  for (const c of cs) {
    assert.equal(c.state.agent_type, 'general-purpose');
    assert.deepEqual(Object.keys(c.expected).sort(), ['claims_build_ok', 'claims_complete', 'claims_tests_added', 'claims_tests_pass', 'claims_tests_run', 'reports_blocker']);
    for (const v of Object.values(c.expected)) assert.equal(typeof v, 'boolean');
  }
});

test('model-router: 30 cases, tiers valid, roughly balanced', async () => {
  const cs = await cases('model-router');
  assert.equal(cs.length, 30);
  const count = { haiku: 0, sonnet: 0, opus: 0 };
  for (const c of cs) {
    assert.ok(['haiku', 'sonnet', 'opus'].includes(c.expected.tier));
    count[c.expected.tier] += 1;
    assert.equal(typeof c.expected.needs_broad_exploration, 'boolean');
    assert.equal(typeof c.expected.asks_for_change, 'boolean');
  }
  for (const n of Object.values(count)) assert.ok(n >= 8, JSON.stringify(count));
});

test('no WorkApp text in any plan-2 fixture', async () => {
  for (const area of ['dynamic-context', 'handback-check', 'model-router']) {
    const text = await readFile(join(toolkitRoot(), 'fixtures', area, 'cases.jsonl'), 'utf8');
    assert.equal(/workapp/i.test(text), false, area);
  }
});
