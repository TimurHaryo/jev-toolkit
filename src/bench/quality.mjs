import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { toolUses, toolResults } from './claude-run.mjs';
import { AGENT_TOOLS, EXCLUDED } from '../adapters/handback-check/pre-hook.mjs';
import { readInjected as readHookState } from '../adapters/dynamic-context/session-state.mjs';

// Global options such as `--no-pager` or `-C <path>` may sit between `git` and `diff`.
const GIT_DIFF = /\bgit\b(?:\s+-{1,2}[\w=./-]+(?:\s+[\w./-]+)?)*\s+diff\b/;
const SUMMARY_ONLY = /--(?:stat|numstat|shortstat|name-only|name-status)\b/;

/** A command that shows the diff body, not just a summary of it. */
export function isFullDiffCommand(command) {
  // Quoted segments (e.g. `-C "/path with space"`) collapse to one token so the option grammar still matches.
  const normalised = String(command ?? '').replace(/"[^"]*"|'[^']*'/g, 'Q');
  return GIT_DIFF.test(normalised) && !SUMMARY_ONLY.test(normalised);
}

export function goldSectionsScore(injected, gold) {
  const i = new Set(injected); const g = new Set(gold);
  const hit = [...i].filter((x) => g.has(x)).length;
  return { recall: g.size ? hit / g.size : null, precision: i.size ? hit / i.size : null };
}

/** The ids the dynamic-context hook recorded for a session, read through the hook's own state module. */
export async function readInjected(logDir, sessionId) {
  return [...(await readHookState(join(logDir, 'state', 'dynamic-context'), sessionId))];
}

export async function listCards(cardsDir) {
  try { return new Set((await readdir(cardsDir)).filter((f) => f.endsWith('.card.md'))); } catch { return new Set(); }
}

export async function handbackSignals(cardsDir, before) {
  const now = await listCards(cardsDir);
  const fresh = [...now].filter((f) => !before.has(f));
  let flags = 0;
  for (const f of fresh) {
    const text = await readFile(join(cardsDir, f), 'utf8');
    const line = text.split('\n').find((l) => l.startsWith('Flags:')) ?? 'Flags: none';
    if (line.trim() !== 'Flags: none') flags += 1;
  }
  return { cards: fresh.length, flags_raised: flags };
}

/** Whether the orchestrator read a full diff after its first non-excluded, top-level Agent call returned. */
export function readFullDiffAfterAgent(events) {
  const uses = toolUses(events);
  const agent = uses.find((t) => AGENT_TOOLS.has(t.name) && !EXCLUDED.has(t.input?.subagent_type));
  if (!agent) return null;
  const agentResult = toolResults(events).find((r) => r.tool_use_id === agent.id);
  const after = agentResult ? agentResult.index : agent.index;
  return uses.some((t) => t.index > after && t.name === 'Bash' && isFullDiffCommand(t.input?.command));
}
