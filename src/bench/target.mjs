import { realpathSync } from 'node:fs';
import { isAllowedRoot } from '../client/guard.mjs';
import { runGit, isGitRepo } from '../adapters/handback-check/git.mjs';

export const BASELINE_TAG = 'jev-baseline';

const realOrSelf = (p) => { try { return realpathSync(p); } catch { return p; } };

export function assertTarget({ targetDir, allowedRoots, runGitImpl = runGit }) {
  if (!isAllowedRoot(targetDir, allowedRoots)) throw new Error(`${targetDir} is not under allowedRoots`);
  // A symlink inside an allowed root must not lead the reset outside it. Roots are resolved too, so a
  // root that is itself reached through a symlink (macOS /tmp, /var) still matches.
  let real;
  try { real = realpathSync(targetDir); } catch { throw new Error(`${targetDir} does not exist`); }
  if (!isAllowedRoot(real, allowedRoots.map(realOrSelf))) throw new Error(`${targetDir} resolves to ${real}, which is not under allowedRoots`);
  if (!isGitRepo(targetDir)) throw new Error(`${targetDir} is not a git repository`);
  // A subdirectory would let reset/clean act on the enclosing repository, outside the target.
  const top = runGitImpl(targetDir, ['rev-parse', '--show-toplevel']);
  let same = false;
  try { same = top !== null && realpathSync(top) === realpathSync(targetDir); } catch { same = false; }
  if (!same) throw new Error(`${targetDir} is not the root of its git repository`);
  if (runGitImpl(targetDir, ['rev-parse', '--verify', `refs/tags/${BASELINE_TAG}`]) === null) throw new Error(`tag ${BASELINE_TAG} is missing in ${targetDir}`);
}

/** Discards every uncommitted change in the target. Callers must have confirmed --yes-reset. */
export function resetTarget({ targetDir, runGitImpl = runGit }) {
  if (runGitImpl(targetDir, ['reset', '--hard', BASELINE_TAG]) === null) throw new Error('git reset failed');
  if (runGitImpl(targetDir, ['clean', '-fd']) === null) throw new Error('git clean failed');
  return { head: runGitImpl(targetDir, ['rev-parse', '--short', 'HEAD']) };
}

/** Marks untracked files intent-to-add so `git diff jev-baseline` shows them as new files. */
function includeUntracked(targetDir, runGitImpl) {
  runGitImpl(targetDir, ['add', '-N', '--', '.']);
}

export function diffStat({ targetDir, runGitImpl = runGit }) {
  includeUntracked(targetDir, runGitImpl);
  // -z keeps paths verbatim (no quoting); --no-renames keeps every record as `ins\tdel\tpath`.
  const numstat = runGitImpl(targetDir, ['diff', BASELINE_TAG, '--numstat', '--no-renames', '-z']) ?? '';
  const files = []; let insertions = 0; let deletions = 0;
  for (const record of numstat.split('\0').filter(Boolean)) {
    const [ins, del, path] = record.split('\t');
    files.push(path); insertions += Number(ins) || 0; deletions += Number(del) || 0;
  }
  return { files, insertions, deletions };
}

export function diffText({ targetDir, runGitImpl = runGit }) {
  includeUntracked(targetDir, runGitImpl);
  return runGitImpl(targetDir, ['diff', BASELINE_TAG]) ?? '';
}
