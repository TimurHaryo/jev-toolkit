import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { toolkitRoot } from '../client/config.mjs';
import { installArm, verifyInstall } from '../targets/install.mjs';
import { headlessEnv } from './providers.mjs';
import { runClaude, parseStream, extractResult } from './claude-run.mjs';
import { assertTarget, resetTarget } from './target.mjs';
import { listCards } from './quality.mjs';
import { ALLOWED_TOOLS } from './runner.mjs';

const commentProbe = (file) => `Create the file ${file} with exactly these two lines and nothing else:\n// increment counter\nval counter = 0\nThen stop.`;

/** The first three run under all-jev; `llm` runs under comment-policy-llm. */
export const PROBES = [
  { name: 'context', prompt: 'Reply with the single word READY and use no tools.' },
  { name: 'comment', prompt: commentProbe('src/JevProbe.kt') },
  { name: 'agent', prompt: 'Use the Agent tool once, in the foreground, with subagent_type general-purpose and this prompt: "Count the Kotlin files under this directory and reply with the number." Then reply with the number it returned.' },
  { name: 'llm', prompt: commentProbe('src/JevProbeLlm.kt') },
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
  const llm = await linesFor(logDir, 'comment-policy-llm', sid(sessions.llm));
  checks.push({ name: 'comment-policy llm hook fired', ok: llm.length > 0, detail: llm.length ? `${llm.length} line(s)` : noLineDetail(sessions.llm) });
  const llmOk = llm.find((l) => l.ok === true);
  checks.push({ name: 'comment-policy llm judge ok', ok: Boolean(llmOk), detail: llmOk ? 'ok' : (llm.map((l) => l.reason).filter(Boolean).join(', ') || 'no call') });
  return { checks };
}

async function installVerified(args) {
  await installArm(args);
  const v = await verifyInstall(args);
  if (!v.ok) throw new Error(`install drift: ${v.problems.join('; ')}`);
}

/** Installs all-jev and runs three tiny sessions, then comment-policy-llm and one more; reports whether each hook fired against the real API. */
export async function checkHooks({ targetDir, config, provider, env, spawnImpl = nodeSpawn, runGitImpl, log = () => {} }) {
  assertTarget({ targetDir, allowedRoots: config.allowedRoots, runGitImpl });
  const base = join(toolkitRoot(), 'targets', 'websocket-inspector');
  const armArgs = (arm) => ({ targetDir, armFile: join(base, 'arms', `${arm}.json`), rulesDir: join(base, 'rules'), toolkitPath: toolkitRoot() });
  const runEnv = headlessEnv({ provider, config, env, runId: 'hooks-check' });
  resetTarget({ targetDir, runGitImpl });
  const sessions = {};
  let cardsBefore;
  const probe = async (p) => {
    log(`probe ${p.name}`);
    const run = await runClaude({ cwd: targetDir, prompt: p.prompt, model: provider.models.sonnet, maxTurns: 6, allowedTools: ALLOWED_TOOLS, env: runEnv, spawnImpl, timeoutMs: 5 * 60 * 1000 });
    sessions[p.name] = { session_id: extractResult(parseStream(run.stdout).result).session_id, code: run.code, timedOut: run.timedOut };
  };
  try {
    await installVerified(armArgs('all-jev'));
    cardsBefore = await listCards(join(config.logDir, 'handback'));
    for (const p of PROBES.filter((x) => x.name !== 'llm')) await probe(p);
    await installVerified(armArgs('comment-policy-llm'));
    await probe(PROBES.find((x) => x.name === 'llm'));
  } finally {
    resetTarget({ targetDir, runGitImpl });
  }
  return { ...(await assessProbes({ logDir: config.logDir, sessions, cardsBefore })), sessions };
}
