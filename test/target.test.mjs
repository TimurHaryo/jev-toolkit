import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertTarget, resetTarget, diffStat } from '../src/bench/target.mjs';

async function repo() {
  const dir = await mkdtemp(join(tmpdir(), 'jevtgt-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@e.com'); git('config', 'user.name', 't');
  await mkdir(join(dir, 'src')); await writeFile(join(dir, 'src', 'A.kt'), 'class A\n');
  git('add', '-A'); git('commit', '-q', '-m', 'base'); git('tag', 'jev-baseline');
  return dir;
}

test('assertTarget refuses outside roots, non-repos, and missing baseline tags', async () => {
  const dir = await repo();
  assert.doesNotThrow(() => assertTarget({ targetDir: dir, allowedRoots: [dir] }));
  assert.throws(() => assertTarget({ targetDir: dir, allowedRoots: ['/elsewhere'] }), /allowedRoots/);
  const bare = await mkdtemp(join(tmpdir(), 'jevbare-'));
  assert.throws(() => assertTarget({ targetDir: bare, allowedRoots: [bare] }), /git repository/);
  const untagged = await repo(); execFileSync('git', ['tag', '-d', 'jev-baseline'], { cwd: untagged });
  assert.throws(() => assertTarget({ targetDir: untagged, allowedRoots: [untagged] }), /jev-baseline/);
});

test('resetTarget discards tracked edits and untracked files; diffStat sees changes since baseline', async () => {
  const dir = await repo();
  await writeFile(join(dir, 'src', 'A.kt'), 'class A { val x = 1 }\n');
  await writeFile(join(dir, 'src', 'New.kt'), 'class New\n');
  const d = diffStat({ targetDir: dir });
  assert.deepEqual(d.files.sort(), ['src/A.kt', 'src/New.kt']);
  assert.equal(d.insertions, 1);
  assert.equal(d.deletions, 1);
  const r = resetTarget({ targetDir: dir });
  assert.match(r.head, /^[0-9a-f]{7,}$/);
  assert.deepEqual(diffStat({ targetDir: dir }), { files: [], insertions: 0, deletions: 0 });
});
