import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { toolUses, toolResults } from './claude-run.mjs';

export function goldSectionsScore(injected, gold) {
  const i = new Set(injected); const g = new Set(gold);
  const hit = [...i].filter((x) => g.has(x)).length;
  return { recall: g.size ? hit / g.size : null, precision: i.size ? hit / i.size : null };
}

export async function readInjected(logDir, sessionId) {
  try {
    const data = JSON.parse(await readFile(join(logDir, 'state', 'dynamic-context', `${String(sessionId).replace(/[^A-Za-z0-9_-]/g, '_')}.json`), 'utf8'));
    return Array.isArray(data.injected) ? data.injected : [];
  } catch { return []; }
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

export function readFullDiffAfterAgent(events) {
  const uses = toolUses(events);
  const agent = uses.find((t) => t.name === 'Agent' || t.name === 'Task');
  if (!agent) return null;
  const agentResult = toolResults(events).find((r) => r.tool_use_id === agent.id);
  const after = agentResult ? agentResult.index : agent.index;
  return uses.some((t) => t.index > after && t.name === 'Bash' && /\bgit diff\b/.test(String(t.input?.command ?? '')));
}
