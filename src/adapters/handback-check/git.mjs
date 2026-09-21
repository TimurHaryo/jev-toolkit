import { execFileSync } from 'node:child_process';

/**
 * Runs git in cwd and returns stdout without its trailing newline, or null on any failure.
 * Only the end is trimmed: `status --porcelain` encodes state in the first two columns,
 * so a leading space is data, not padding.
 */
export function runGit(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trimEnd();
  } catch {
    return null;
  }
}

export function isGitRepo(cwd) {
  return runGit(cwd, ['rev-parse', '--is-inside-work-tree']) === 'true';
}
