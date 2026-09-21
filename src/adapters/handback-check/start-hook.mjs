import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../../client/config.mjs';
import { isAllowedRoot } from '../../client/guard.mjs';
import { isGitRepo } from './git.mjs';
import { takeSnapshot } from './snapshot.mjs';

const NOTHING = { output: null, exitCode: 0 };

export function snapshotPath(logDir, agentId) {
  return join(logDir, 'handback', `${String(agentId || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_')}.start.json`);
}

/** Records the dirty-tree hashes when a subagent starts so its own changes can be isolated at stop. Never throws. */
export async function runSubagentStart(input, opts = {}) {
  try {
    const config = opts.config ?? loadConfig();
    if (config.disabled) return NOTHING;
    const cwd = input.cwd ?? process.cwd();
    if (config.configMissing || !isAllowedRoot(cwd, config.allowedRoots) || !isGitRepo(cwd)) return NOTHING;
    const path = snapshotPath(config.logDir, input.agent_id);
    await mkdir(join(config.logDir, 'handback'), { recursive: true });
    await writeFile(path, JSON.stringify({ ts: new Date().toISOString(), agent_type: input.agent_type ?? null, ...takeSnapshot(cwd) }));
    return NOTHING;
  } catch {
    return NOTHING;
  }
}
