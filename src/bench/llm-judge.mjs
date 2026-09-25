import { spawn as nodeSpawn } from 'node:child_process';
import { appendLog } from '../client/log.mjs';

const TAIL = 'Reply with ONLY a JSON object. For each noul id give a number in [0,1]. For each choice id give {"choice": <option>, "confidence": <0..1>}. No prose.';

export function buildJudgePrompt(state, questions) {
  const qs = Object.entries(questions).map(([id, q]) => `- ${id} (${q.type}): ${q.instructions}\n  criteria: ${JSON.stringify(q.criteria ?? null)}`).join('\n');
  return `You are a strict classifier. Evaluate the questions against the state.\n\nSTATE:\n${JSON.stringify(state)}\n\nQUESTIONS:\n${qs}\n\n${TAIL}`;
}

function firstJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  for (let end = text.length; end > start; end -= 1) {
    if (text[end - 1] !== '}') continue;
    try { return JSON.parse(text.slice(start, end)); } catch { /* keep shrinking */ }
  }
  return null;
}

const inUnit = (v) => typeof v === 'number' && v >= 0 && v <= 1;

export function parseJudgeAnswers(text, questions) {
  const obj = firstJsonObject(String(text ?? ''));
  if (!obj) return { ok: false, reason: 'judge_parse', detail: 'no JSON object in judge output' };
  const answers = {};
  for (const [id, q] of Object.entries(questions)) {
    const v = obj[id];
    if (q.type === 'noul') {
      if (!inUnit(v)) return { ok: false, reason: 'judge_parse', detail: `${id}: expected a number in [0,1]` };
      answers[id] = { type: 'noul', noul: v };
    } else if (q.type === 'choice') {
      if (!v || typeof v !== 'object' || !Object.prototype.hasOwnProperty.call(q.criteria, v.choice)) return { ok: false, reason: 'judge_parse', detail: `${id}: bad choice` };
      answers[id] = { type: 'choice', choice: v.choice, probabilities: {}, confidence: inUnit(v.confidence) ? v.confidence : 0.5 };
    } else {
      return { ok: false, reason: 'judge_parse', detail: `${id}: unsupported type ${q.type}` };
    }
  }
  return { ok: true, answers };
}

function runClaudeJson({ prompt, model, spawnImpl, env, timeoutMs }) {
  return new Promise((resolve) => {
    const args = ['-p', prompt, '--output-format', 'json', '--model', model, '--max-turns', '1'];
    const child = spawnImpl('claude', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; child.kill(); resolve({ ok: false, reason: 'judge_timeout' }); } }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', (e) => { if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, reason: 'judge_spawn', detail: e.message }); } });
    child.on('close', (code) => {
      if (done) return;
      done = true; clearTimeout(timer);
      if (code !== 0) return resolve({ ok: false, reason: `judge_exit_${code}`, detail: out.slice(0, 500) });
      try { resolve({ ok: true, body: JSON.parse(out) }); } catch { resolve({ ok: false, reason: 'judge_parse', detail: 'claude output is not JSON' }); }
    });
  });
}

/** Asks a Claude Code headless session to answer Jev-style questions; used only for the LLM arms. */
export async function judge({ state, questions, model, spawnImpl = nodeSpawn, env = process.env, timeoutMs = 60000 }) {
  const started = Date.now();
  const r = await runClaudeJson({ prompt: buildJudgePrompt(state, questions), model, spawnImpl, env, timeoutMs });
  if (!r.ok) return r;
  const parsed = parseJudgeAnswers(r.body?.result ?? '', questions);
  if (!parsed.ok) return parsed;
  return { ok: true, answers: parsed.answers, meta: { latencyMs: Date.now() - started, usage: r.body?.usage ?? {} } };
}

/** A drop-in for decide(): same signature, answers come from the LLM judge instead of Jev. */
export function makeJudgeDecide({ model, spawnImpl, env, loadArea = (area) => import(`../questions/${area}.mjs`) }) {
  return async (area, state, ctx = {}) => {
    const started = Date.now();
    let result;
    try {
      const mod = await loadArea(area);
      result = await judge({ state, questions: mod.buildQuestions(state), model, spawnImpl, env });
    } catch (e) {
      result = { ok: false, reason: 'internal', detail: e?.message };
    }
    try {
      if (ctx.config?.logDir) await appendLog(ctx.config.logDir, `${area}-llm`, { ts: new Date(started).toISOString(), area, model, ok: result.ok, reason: result.ok ? null : result.reason, latencyMs: Date.now() - started, usage: result.meta?.usage ?? null });
    } catch { /* best-effort */ }
    return result;
  };
}
