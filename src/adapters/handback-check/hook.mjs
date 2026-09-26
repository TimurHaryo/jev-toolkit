import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../../client/config.mjs';
import { isAllowedRoot } from '../../client/guard.mjs';
import { decide } from '../../client/jev-client.mjs';
import { thresholds } from '../../questions/handback-check.mjs';
import { isGitRepo } from './git.mjs';
import { collectFacts, mentionedNotInDiff } from './facts.mjs';
import { flagsFor, renderCard } from './card.mjs';
import { summaryFromResponse } from './response.mjs';
import { AGENT_TOOLS, EXCLUDED, skipLog, snapshotPath } from './pre-hook.mjs';

const AREA = 'handback-check';
const NOTHING = { output: null, exitCode: 0 };
// A background dispatch returns before the subagent has done anything; its real result never
// passes through this hook, so measuring the tree here would attribute nothing to it.
const ASYNC_DISPATCH = /Async agent launched/i;

async function readSnapshot(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

/**
 * Never throws. Builds the hand-back card for the parent agent as PostToolUse on the Agent tool,
 * so `additionalContext` reaches the model that dispatched the subagent. On Jev failure the card
 * still carries facts.
 */
export async function runHandbackPost(input, opts = {}) {
  try {
    if (!AGENT_TOOLS.has(input.tool_name)) return NOTHING;
    const config = opts.config ?? loadConfig();
    const env = opts.env ?? process.env;
    const fetchImpl = opts.fetchImpl ?? fetch;
    const decideImpl = opts.decideImpl ?? decide;
    if (config.disabled) return NOTHING;
    const cwd = input.cwd ?? process.cwd();
    if (config.configMissing || !isAllowedRoot(cwd, config.allowedRoots)) {
      await skipLog(config, { reason: config.configMissing ? 'config_missing' : 'not_allowed_root', cwd });
      return NOTHING;
    }
    const agentType = input.tool_input?.subagent_type ?? 'unknown';
    if (EXCLUDED.has(agentType) || !isGitRepo(cwd)) return NOTHING;

    const summary = summaryFromResponse(input.tool_response);
    const startPath = snapshotPath(config.logDir, input.tool_use_id ?? 'unknown');
    if (ASYNC_DISPATCH.test(summary)) {
      // The snapshot stays: it is still the right "before" for whenever the work lands.
      await skipLog(config, { reason: 'async_dispatch', agent_type: agentType });
      return NOTHING;
    }
    const before = await readSnapshot(startPath);
    // Consumed before measuring: when logDir sits inside the repo, the snapshot file is itself
    // a dirty path and would otherwise be attributed to the subagent.
    try { await rm(startPath, { force: true }); } catch { /* best-effort */ }
    const facts = collectFacts(cwd, { before: before ? { files: before.files ?? {} } : undefined });

    const r = await decideImpl(AREA, { summary, agent_type: agentType }, { cwd, sessionId: input.session_id ?? null, config, fetchImpl });
    const answers = r.ok ? r.answers : null;
    const flags = flagsFor({ answers, facts, thresholds });
    const mentioned = mentionedNotInDiff(summary, facts, { cwd });
    const model = input.tool_input?.model ?? env.CLAUDE_CODE_SUBAGENT_MODEL ?? undefined;
    const card = renderCard({ agentType, model, flags, facts, answers, reason: r.ok ? undefined : r.reason, mentioned });

    try {
      await mkdir(join(config.logDir, 'handback'), { recursive: true });
      await writeFile(startPath.replace(/\.start\.json$/, '.card.md'), card);
    } catch { /* best-effort */ }

    return { output: { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: card } }, exitCode: 0 };
  } catch {
    return NOTHING;
  }
}
