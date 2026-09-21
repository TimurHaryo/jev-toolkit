import { resolve, sep } from 'node:path';

/** Thrown when the current directory is not under any configured target root. */
export class NotAllowedRoot extends Error {
  constructor(cwd) {
    super(`JEV refused: ${cwd} is not under an allowed root`);
    this.code = 'not_allowed_root';
  }
}

export function isAllowedRoot(cwd, roots) {
  const target = resolve(cwd);
  return roots.some((root) => {
    const r = resolve(root);
    return target === r || target.startsWith(r + sep);
  });
}

export function assertAllowedRoot(cwd, roots) {
  if (!isAllowedRoot(cwd, roots)) throw new NotAllowedRoot(cwd);
}
