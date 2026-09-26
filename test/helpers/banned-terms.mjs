import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toolkitRoot } from '../../src/client/config.mjs';

/** Terms that must never appear in shipped content, read from the gitignored `.jev-banned-terms` (one per line). */
export function bannedTerms() {
  try {
    return readFileSync(join(toolkitRoot(), '.jev-banned-terms'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}

export function findBanned(text) {
  const lower = String(text).toLowerCase();
  return bannedTerms().find((t) => lower.includes(t.toLowerCase())) ?? null;
}
