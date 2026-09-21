import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runGit } from './git.mjs';

/**
 * Paths from `git status --porcelain -uall`, including renames' new names.
 * Read NUL-separated: the newline form C-quotes any path holding a space or a non-ASCII byte,
 * which would then match no file on disk.
 */
export function dirtyPaths(cwd) {
  const out = runGit(cwd, ['status', '--porcelain', '-z', '-uall']);
  if (!out) return [];
  const entries = out.split('\0').filter(Boolean);
  const paths = [];
  for (let i = 0; i < entries.length; i += 1) {
    paths.push(entries[i].slice(3));
    // A rename or copy is followed by its source path, which is not a change of its own.
    if (entries[i][0] === 'R' || entries[i][0] === 'C') i += 1;
  }
  return paths;
}

/** Content hash of every dirty path, so a later snapshot can tell what changed in between. */
export function takeSnapshot(cwd) {
  const files = {};
  for (const path of dirtyPaths(cwd)) {
    files[path] = existsSync(join(cwd, path)) ? (runGit(cwd, ['hash-object', '--', path]) ?? 'unhashable') : 'deleted';
  }
  return { files };
}

export function diffSnapshots(before, after) {
  return Object.entries(after.files).filter(([path, hash]) => before.files[path] !== hash).map(([path]) => path);
}
