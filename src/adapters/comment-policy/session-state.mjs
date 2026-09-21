import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const MAX_DENIES = 2;

export function editHash(filePath, text) {
  return createHash('sha256').update(filePath).update('\0').update(text).digest('hex');
}

function safeName(sessionId) {
  return String(sessionId || 'no-session').replace(/[^A-Za-z0-9_-]/g, '_');
}

async function readState(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}

/** Counts how many times the same edit has been denied in this session so the hook can stop looping. */
export async function bumpDenyCount(stateDir, sessionId, hash) {
  await mkdir(stateDir, { recursive: true });
  const path = join(stateDir, `${safeName(sessionId)}.json`);
  const state = await readState(path);
  const next = { ...state, [hash]: (state[hash] ?? 0) + 1 };
  await writeFile(path, JSON.stringify(next));
  return next[hash];
}
