import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractComments } from '../src/adapters/comment-policy/comments.mjs';

test('line comment with following code', () => {
  const src = 'val a = 1\n// increment counter\ncounter++\n\nprintln(counter)\nreturn counter\nx()\n';
  const [c] = extractComments(src);
  assert.equal(c.id, 0);
  assert.equal(c.line, 2);
  assert.equal(c.kind, 'line');
  assert.equal(c.text, 'increment counter');
  assert.equal(c.codeAfter, 'counter++\nprintln(counter)\nreturn counter');
});

test('block and kdoc comments are classified and cleaned', () => {
  const src = '/**\n * Returns the id.\n * @param id the id\n */\nfun f(id: String) = id\n/* plain\n   block */\nval x = 1\n';
  const [k, b] = extractComments(src);
  assert.equal(k.kind, 'kdoc');
  assert.equal(k.text, 'Returns the id.\n@param id the id');
  assert.equal(k.codeAfter, 'fun f(id: String) = id');
  assert.equal(b.kind, 'block');
  assert.equal(b.text, 'plain\nblock');
  assert.equal(b.line, 6);
});

test('comment markers inside strings, raw strings, and chars are ignored', () => {
  const src = 'val u = "http://x // not a comment"\nval r = """\n// also not\n"""\nval c = \'/\'\n// real\nval y = 2\n';
  const cs = extractComments(src);
  assert.equal(cs.length, 1);
  assert.equal(cs[0].text, 'real');
});

test('nested block comments end at the matching close', () => {
  const src = '/* outer /* inner */ still outer */\nval z = 3\n';
  const [c] = extractComments(src);
  assert.equal(c.text, 'outer /* inner */ still outer');
  assert.equal(c.codeAfter, 'val z = 3');
});

test('codeAfter skips blank lines and other comments, and may be empty at EOF', () => {
  const src = '// first\n\n// second\nval a = 1\n// last\n';
  const cs = extractComments(src);
  assert.equal(cs[0].codeAfter, 'val a = 1');
  assert.equal(cs[2].codeAfter, '');
});

test('ids are sequential', () => {
  const cs = extractComments('// a\n// b\n// c\n');
  assert.deepEqual(cs.map((c) => c.id), [0, 1, 2]);
});
