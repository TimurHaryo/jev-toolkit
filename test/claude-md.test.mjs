import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderClaudeMd } from '../src/targets/claude-md.mjs';

const rules = [
  { id: 'core', summary: '', paths: [], always: true, body: '# Core\n\ncore body\n', file: '00-core.md' },
  { id: 'compose', summary: 'C', paths: ['**/ui/**'], always: false, body: '# Compose\n', file: '02-compose.md' },
  { id: 'git', summary: 'G', paths: [], always: false, body: '# Git\n', file: '10-git.md' },
];

test('full: core body then every non-core rule body inlined in order, no imports', () => {
  const out = renderClaudeMd('full', rules);
  assert.ok(out.startsWith('# Core\n\ncore body\n'));
  assert.ok(out.endsWith('\n'));
  assert.match(out, /# Core[\s\S]*# Compose[\s\S]*# Git/);
  assert.doesNotMatch(out, /@\.claude/);
  assert.doesNotMatch(out, /00-core/);
});

test('stub: core body then the injection notice, no imports', () => {
  const out = renderClaudeMd('stub', rules);
  assert.match(out, /injected per task by the JEV dynamic-context hook/);
  assert.doesNotMatch(out, /@\.claude/);
});

test('native: core body only', () => {
  assert.equal(renderClaudeMd('native', rules), '# Core\n\ncore body\n');
});

test('unknown variant throws; missing core throws', () => {
  assert.throws(() => renderClaudeMd('bogus', rules), /variant/);
  assert.throws(() => renderClaudeMd('full', rules.slice(1)), /core/);
});

test('an orchestrator note is appended under its own heading, for every variant', () => {
  for (const v of ['full', 'stub', 'native']) {
    const out = renderClaudeMd(v, rules, 'Read the card first.');
    assert.match(out, /\n## Orchestrator note \(benchmark arm\)\n\nRead the card first\.\n$/);
  }
  assert.doesNotMatch(renderClaudeMd('full', rules, ''), /Orchestrator note/);
  assert.doesNotMatch(renderClaudeMd('full', rules), /Orchestrator note/);
});
