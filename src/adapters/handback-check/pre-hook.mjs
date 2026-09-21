import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../../client/config.mjs';
import { isAllowedRoot } from '../../client/guard.mjs';
import { appendLog } from '../../client/log.mjs';
import { isGitRepo } from './git.mjs';
import { takeSnapshot } from './snapshot.mjs';

const AREA = 'handback-check';
const NOTHING = { output: null, exitCode: 0 };

/** `Task` is the legacy alias Claude Code maps onto the `Agent` tool; both carry the same tool_input. */
export const AGENT_TOOLS = new Set(['Agent', 'Task']);
export const EXCLUDED = new Set(['Explore', 'Plan', 'claude-code-guide']);

export function snapshotPath(logDir, key) {
  return join(logDir, 'handback', `${String(key || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_')}.start.json`);
}

export async function skipLog(config, fields) {
  try { await appendLog(config.logDir, AREA, { ts: new Date().toISOString(), area: AREA, event: 'skipped', ...fields }); } catch { /* best-effort */ }
}

/**
 * Records the dirty-tree hashes before a subagent runs, so the PostToolUse hook can isolate
 * the subagent's own changes. Runs on the parent's side, as PreToolUse for the Agent tool.
 * Never throws.
 */
export async function runHandbackPre(input, opts = {}) {
  try {
    if (!AGENT_TOOLS.has(input.tool_name)) return NOTHING;
    const config = opts.config ?? loadConfig();
    if (config.disabled) return NOTHING;
    const cwd = input.cwd ?? process.cwd();
    if (config.configMissing || !isAllowedRoot(cwd, config.allowedRoots)) {
      await skipLog(config, { reason: config.configMissing ? 'config_missing' : 'not_allowed_root', cwd });
      return NOTHING;
    }
    const agentType = input.tool_input?.subagent_type ?? 'unknown';
    if (EXCLUDED.has(agentType)) {
      await skipLog(config, { reason: 'excluded_agent_type', agent_type: agentType });
      return NOTHING;
    }
    if (!isGitRepo(cwd)) {
      await skipLog(config, { reason: 'not_git_repo', cwd });
      return NOTHING;
    }
    const path = snapshotPath(config.logDir, input.tool_use_id ?? 'unknown');
    await mkdir(join(config.logDir, 'handback'), { recursive: true });
    await writeFile(path, JSON.stringify({ ts: new Date().toISOString(), agent_type: agentType, ...takeSnapshot(cwd) }));
    return NOTHING;
  } catch {
    return NOTHING;
  }
}
