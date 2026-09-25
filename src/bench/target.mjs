import { isAllowedRoot } from '../client/guard.mjs';
import { runGit, isGitRepo } from '../adapters/handback-check/git.mjs';

export const BASELINE_TAG = 'jev-baseline';

export function assertTarget({ targetDir, allowedRoots, runGitImpl = runGit }) {
  if (!isAllowedRoot(targetDir, allowedRoots)) throw new Error(`${targetDir} is not under allowedRoots`);
  if (!isGitRepo(targetDir)) throw new Error(`${targetDir} is not a git repository`);
  if (runGitImpl(targetDir, ['rev-parse', '--verify', `refs/tags/${BASELINE_TAG}`]) === null) throw new Error(`tag ${BASELINE_TAG} is missing in ${targetDir}`);
}

/** Discards every uncommitted change in the target. Callers must have confirmed --yes-reset. */
export function resetTarget({ targetDir, runGitImpl = runGit }) {
  if (runGitImpl(targetDir, ['reset', '--hard', BASELINE_TAG]) === null) throw new Error('git reset failed');
  if (runGitImpl(targetDir, ['clean', '-fd']) === null) throw new Error('git clean failed');
  return { head: runGitImpl(targetDir, ['rev-parse', '--short', 'HEAD']) };
}

export function diffStat({ targetDir, runGitImpl = runGit }) {
  const numstat = runGitImpl(targetDir, ['diff', BASELINE_TAG, '--numstat']) ?? '';
  const files = []; let insertions = 0; let deletions = 0;
  for (const line of numstat.split('\n').filter(Boolean)) {
    const [ins, del, path] = line.split('\t');
    files.push(path); insertions += Number(ins) || 0; deletions += Number(del) || 0;
  }
  const untracked = (runGitImpl(targetDir, ['ls-files', '--others', '--exclude-standard', '-z']) ?? '').split('\0').filter(Boolean);
  for (const u of untracked) files.push(u);
  return { files, insertions, deletions };
}

export function diffText({ targetDir, runGitImpl = runGit }) {
  return runGitImpl(targetDir, ['diff', BASELINE_TAG]) ?? '';
}
