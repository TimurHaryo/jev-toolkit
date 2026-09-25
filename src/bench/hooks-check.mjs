import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { toolkitRoot } from '../client/config.mjs';
import { installArm, verifyInstall } from '../targets/install.mjs';
import { armEnv } from './providers.mjs';
import { runClaude, parseStream, extractResult } from './claude-run.mjs';
import { assertTarget, resetTarget } from './target.mjs';
import { listCards } from './quality.mjs';
import { ALLOWED_TOOLS } from './runner.mjs';

export const PROBES = [
  { name: 'context', prompt: 'Reply with the single word READY and use no tools.' },
  { name: 'comment', prompt: 'Create the file src/JevProbe.kt with exactly these two lines and nothing else:\n// increment counter\nval counter = 0\nThen stop.' },
  { name: 'agent', prompt: 'Use the Agent tool once, in the foreground, with subagent_type general-purpose and this prompt: "Count the Kotlin files under this directory and reply with the number." Then reply with the number it returned.' },
];

async function linesFor(logDir, area, sessionId) {
  try {
    return (await readFile(join(logDir, `${area}.jsonl`), 'utf8')).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((e) => e && e.sessionId === sessionId);
  } catch { return []; }
}

const sid = (s) => (typeof s === 'string' ? s : s?.session_id ?? null);

function noLineDetail(s) {
  const base = `no line with sessionId ${sid(s)}`;
  return s && typeof s === 'object' ? `${base}; probe exit ${s.code}, timedOut ${s.timedOut}` : base;
}

/** `sessions` maps each probe to a session id string or to `{ session_id, code, timedOut }`. */
export async function assessProbes({ logDir, sessions, cardsBefore }) {
  const checks = [];
  for (const [area, key] of [['dynamic-context', 'context'], ['comment-policy', 'comment']]) {
    const lines = await linesFor(logDir, area, sid(sessions[key]));
    checks.push({ name: `${area} hook fired`, ok: lines.length > 0, detail: lines.length ? `${lines.length} line(s)${lines.some((l) => l.event === 'skipped') ? ', includes skipped' : ''}` : noLineDetail(sessions[key]) });
    const okLine = lines.find((l) => l.ok === true);
    checks.push({ name: `${area} Jev call ok`, ok: Boolean(okLine), detail: okLine ? 'ok' : (lines.map((l) => l.reason).filter(Boolean).join(', ') || 'no call') });
  }
  const cardsDir = join(logDir, 'handback');
  const fresh = [...(await listCards(cardsDir))].filter((f) => !cardsBefore.has(f));
  checks.push({ name: 'hand-back card produced', ok: fresh.length > 0, detail: fresh.length ? fresh.join(', ') : 'no new card' });
  let facts = false; let detail = 'no card';
  if (fresh.length) { const text = await readFile(join(cardsDir, fresh[0]), 'utf8'); const line = text.split('\n').find((l) => l.startsWith('Facts:')) ?? ''; facts = /attribution snapshot/.test(line); detail = line || 'no Facts line'; }
  checks.push({ name: 'hand-back card has facts', ok: facts, detail });
  return { checks };
}

/** Installs all-jev, runs three tiny sessions, and reports whether each hook actually fired against the real API. */
export async function checkHooks({ targetDir, config, provider, env, spawnImpl = nodeSpawn, runGitImpl, log = () => {} }) {
  assertTarget({ targetDir, allowedRoots: config.allowedRoots, runGitImpl });
  const base = join(toolkitRoot(), 'targets', 'websocket-inspector');
  const args = { targetDir, armFile: join(base, 'arms', 'all-jev.json'), rulesDir: join(base, 'rules'), toolkitPath: toolkitRoot() };
  const runEnv = { ...process.env, ...env, ...armEnv({ provider, env, runId: 'hooks-check', logDir: config.logDir }) };
  // A native Anthropic run must not be redirected by a base URL left in the caller's environment.
  if (!provider.baseUrl) delete runEnv.ANTHROPIC_BASE_URL;
  resetTarget({ targetDir, runGitImpl });
  const sessions = {};
  let cardsBefore;
  try {
    await installArm(args);
    const v = await verifyInstall(args);
    if (!v.ok) throw new Error(`install drift: ${v.problems.join('; ')}`);
    cardsBefore = await listCards(join(config.logDir, 'handback'));
    for (const probe of PROBES) {
      log(`probe ${probe.name}`);
      const run = await runClaude({ cwd: targetDir, prompt: probe.prompt, model: provider.models.sonnet, maxTurns: 6, allowedTools: ALLOWED_TOOLS, env: runEnv, spawnImpl, timeoutMs: 5 * 60 * 1000 });
      sessions[probe.name] = { session_id: extractResult(parseStream(run.stdout).result).session_id, code: run.code, timedOut: run.timedOut };
    }
  } finally {
    resetTarget({ targetDir, runGitImpl });
  }
  return { ...(await assessProbes({ logDir: config.logDir, sessions, cardsBefore })), sessions };
}
