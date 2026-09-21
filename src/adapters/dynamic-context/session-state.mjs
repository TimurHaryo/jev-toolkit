import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function pathFor(stateDir, sessionId) {
  return join(stateDir, `${String(sessionId || 'no-session').replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
}

export async function readInjected(stateDir, sessionId) {
  try {
    const data = JSON.parse(await readFile(pathFor(stateDir, sessionId), 'utf8'));
    return new Set(Array.isArray(data.injected) ? data.injected : []);
  } catch {
    return new Set();
  }
}

export async function markInjected(stateDir, sessionId, ids) {
  await mkdir(stateDir, { recursive: true });
  const current = await readInjected(stateDir, sessionId);
  for (const id of ids) current.add(id);
  await writeFile(pathFor(stateDir, sessionId), JSON.stringify({ injected: [...current] }));
}
