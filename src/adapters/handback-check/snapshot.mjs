import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runGit } from './git.mjs';

/** Paths from `git status --porcelain -uall`, including renames' new names. */
export function dirtyPaths(cwd) {
  const out = runGit(cwd, ['status', '--porcelain', '-uall']);
  if (!out) return [];
  return out.split('\n').filter(Boolean).map((line) => {
    const path = line.slice(3);
    return path.includes(' -> ') ? path.split(' -> ')[1] : path;
  });
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
