import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../../client/config.mjs';
import { isAllowedRoot } from '../../client/guard.mjs';
import { appendLog } from '../../client/log.mjs';
import { decide } from '../../client/jev-client.mjs';
import { thresholds } from '../../questions/handback-check.mjs';
import { isGitRepo } from './git.mjs';
import { collectFacts } from './facts.mjs';
import { flagsFor, renderCard } from './card.mjs';
import { snapshotPath } from './start-hook.mjs';

const AREA = 'handback-check';
const EXCLUDED = new Set(['Explore', 'Plan', 'claude-code-guide']);
const NOTHING = { output: null, exitCode: 0 };

async function skipLog(config, fields) {
  try { await appendLog(config.logDir, AREA, { ts: new Date().toISOString(), area: AREA, event: 'skipped', ...fields }); } catch { /* best-effort */ }
}

async function readSnapshot(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

/** Never throws. Builds the hand-back card for the parent agent; on Jev failure the card still carries facts. */
export async function runHandbackCheck(input, opts = {}) {
  try {
    const config = opts.config ?? loadConfig();
    const fetchImpl = opts.fetchImpl ?? fetch;
    const decideImpl = opts.decideImpl ?? decide;
    if (config.disabled) return NOTHING;
    const cwd = input.cwd ?? process.cwd();
    if (config.configMissing || !isAllowedRoot(cwd, config.allowedRoots)) {
      await skipLog(config, { reason: config.configMissing ? 'config_missing' : 'not_allowed_root', cwd });
      return NOTHING;
    }
    const agentType = input.agent_type ?? 'unknown';
    if (EXCLUDED.has(agentType) || !isGitRepo(cwd)) return NOTHING;

    const summary = String(input.last_assistant_message ?? '');
    const startPath = snapshotPath(config.logDir, input.agent_id);
    const before = await readSnapshot(startPath);
    // Consumed before measuring: when logDir sits inside the repo, the snapshot file is itself
    // a dirty path and would otherwise be attributed to the subagent.
    await rm(startPath, { force: true });
    const facts = collectFacts(cwd, { before: before ? { files: before.files ?? {} } : undefined });

    const r = await decideImpl(AREA, { summary, agent_type: agentType }, { cwd, sessionId: input.session_id ?? null, config, fetchImpl });
    const answers = r.ok ? r.answers : null;
    const flags = flagsFor({ answers, facts, thresholds, summary });
    const card = renderCard({ agentType, model: input.model, flags, facts, answers, reason: r.ok ? undefined : r.reason });

    try {
      await mkdir(join(config.logDir, 'handback'), { recursive: true });
      await writeFile(startPath.replace(/\.start\.json$/, '.card.md'), card);
    } catch { /* best-effort */ }

    return { output: { hookSpecificOutput: { hookEventName: 'SubagentStop', additionalContext: card } }, exitCode: 0 };
  } catch {
    return NOTHING;
  }
}
