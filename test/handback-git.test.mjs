import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runGit, isGitRepo } from '../src/adapters/handback-check/git.mjs';
import { takeSnapshot, diffSnapshots } from '../src/adapters/handback-check/snapshot.mjs';
import { collectFacts, mentionedNotInDiff } from '../src/adapters/handback-check/facts.mjs';

async function repo() {
  const dir = await mkdtemp(join(tmpdir(), 'jevgit-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  await mkdir(join(dir, 'src'));
  await writeFile(join(dir, 'src', 'A.kt'), 'class A\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  return dir;
}

test('runGit returns stdout or null; isGitRepo', async () => {
  const dir = await repo();
  assert.match(runGit(dir, ['rev-parse', '--abbrev-ref', 'HEAD']), /main/);
  assert.equal(runGit(dir, ['rev-parse', '--verify', 'nope']), null);
  assert.equal(isGitRepo(dir), true);
  assert.equal(isGitRepo(await mkdtemp(join(tmpdir(), 'jevnogit-'))), false);
});

test('snapshot diff attributes only the changes made after the snapshot', async () => {
  const dir = await repo();
  await writeFile(join(dir, 'src', 'B.kt'), 'class B\n');           // dirty before the subagent
  const before = takeSnapshot(dir);
  assert.deepEqual(Object.keys(before.files), ['src/B.kt']);
  await writeFile(join(dir, 'src', 'A.kt'), 'class A { val x = 1 }\n'); // subagent edits tracked file
  await writeFile(join(dir, 'src', 'ATest.kt'), 'class ATest\n');    // subagent adds a test
  await writeFile(join(dir, 'src', 'B.kt'), 'class B\n');            // untouched content
  const after = takeSnapshot(dir);
  assert.deepEqual(diffSnapshots(before, after).sort(), ['src/A.kt', 'src/ATest.kt']);
});

test('collectFacts with a snapshot: files, test flag, counts, attribution', async () => {
  const dir = await repo();
  const before = takeSnapshot(dir);
  await writeFile(join(dir, 'src', 'A.kt'), 'class A\nval y = 2\n');
  await writeFile(join(dir, 'src', 'ATest.kt'), 'class ATest\nfun t() {}\n');
  const f = collectFacts(dir, { before });
  assert.equal(f.isGitRepo, true);
  assert.deepEqual(f.filesChanged.sort(), ['src/A.kt', 'src/ATest.kt']);
  assert.equal(f.testFilesChanged, true);
  assert.equal(f.insertions, 3);
  assert.equal(f.deletions, 0);
  assert.equal(f.untracked, 1);
  assert.equal(f.attribution, 'snapshot');
});

test('collectFacts without a snapshot falls back to HEAD and reports attribution head; non-repo reports none', async () => {
  const dir = await repo();
  await writeFile(join(dir, 'src', 'A.kt'), 'class A2\n');
  const f = collectFacts(dir, {});
  assert.deepEqual(f.filesChanged, ['src/A.kt']);
  assert.equal(f.testFilesChanged, false);
  assert.equal(f.attribution, 'head');
  const g = collectFacts(await mkdtemp(join(tmpdir(), 'jevnogit-')), {});
  assert.equal(g.isGitRepo, false);
  assert.equal(g.attribution, 'none');
  assert.deepEqual(g.filesChanged, []);
});

test('paths with spaces are attributed correctly', async () => {
  const dir = await repo();
  const before = takeSnapshot(dir);
  await writeFile(join(dir, 'src', 'A.kt'), 'class A\nval z = 1\n');
  await writeFile(join(dir, 'src', 'my file.kt'), 'class B\n');
  const f = collectFacts(dir, { before });
  assert.deepEqual(f.filesChanged.sort(), ['src/A.kt', 'src/my file.kt']);
  assert.equal(f.untracked, 1);
  assert.equal(f.insertions, 2);
});

test('mentionedNotInDiff finds paths the summary names that the diff does not contain', () => {
  const facts = { filesChanged: ['inspector/src/main/kotlin/x/SessionTracker.kt'] };
  const summary = 'Edited SessionTracker.kt and added internal/data/FrameRepository.kt; also touched build.gradle.kts';
  assert.deepEqual(mentionedNotInDiff(summary, facts).sort(), ['build.gradle.kts', 'internal/data/FrameRepository.kt']);
  assert.deepEqual(mentionedNotInDiff('no files here', facts), []);
  assert.deepEqual(mentionedNotInDiff('fixed ../src/A.kt', { filesChanged: ['src/A.kt'] }), []);
});
