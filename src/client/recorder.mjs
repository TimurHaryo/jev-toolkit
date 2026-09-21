import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export function recordingKey(state, questions) {
  return createHash('sha256').update(JSON.stringify({ state, questions })).digest('hex');
}

export function recordingPath(dir, area, key) {
  return join(dir, area, `${key}.json`);
}

export async function readRecording(dir, area, key) {
  try {
    return JSON.parse(await readFile(recordingPath(dir, area, key), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

export async function writeRecording(dir, area, key, body) {
  const path = recordingPath(dir, area, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(body, null, 2));
}
