import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function appendLog(logDir, area, entry) {
  await mkdir(logDir, { recursive: true });
  await appendFile(join(logDir, `${area}.jsonl`), `${JSON.stringify(entry)}\n`);
}
