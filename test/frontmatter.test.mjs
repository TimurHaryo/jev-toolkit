import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../src/targets/frontmatter.mjs';

const doc = `---
id: compose
summary: Compose rules: theme tokens, previews
paths:
  - "**/ui/**/*.kt"
  - "**/*Screen.kt"
always: false
---
# Compose

Body line.
`;

test('parses id, summary, paths, always, and body', () => {
  const { meta, body } = parseFrontmatter(doc);
  assert.deepEqual(meta, { id: 'compose', summary: 'Compose rules: theme tokens, previews', paths: ['**/ui/**/*.kt', '**/*Screen.kt'], always: false });
  assert.equal(body, '# Compose\n\nBody line.\n');
});

test('defaults: no summary, no paths, no always; empty paths list', () => {
  const { meta } = parseFrontmatter('---\nid: x\n---\nbody');
  assert.deepEqual(meta, { id: 'x', summary: '', paths: [], always: false });
  assert.deepEqual(parseFrontmatter('---\nid: y\npaths: []\n---\n').meta.paths, []);
  assert.equal(parseFrontmatter('---\nid: y\nalways: true\n---\n').meta.always, true);
});

test('missing id throws; missing frontmatter block throws', () => {
  assert.throws(() => parseFrontmatter('---\nsummary: s\n---\n'), /missing id/);
  assert.throws(() => parseFrontmatter('# no frontmatter'), /frontmatter/);
});
