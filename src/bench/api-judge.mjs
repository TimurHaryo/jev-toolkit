import { appendLog } from '../client/log.mjs';
import { buildJudgePrompt, parseJudgeAnswers } from './llm-judge.mjs';

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 512;
const DEFAULT_TIMEOUT_MS = 30000;
const TIMED_OUT = Symbol('timeout');

const messagesUrl = (provider) => `${(provider.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')}/v1/messages`;

function headersFor(provider, token) {
  const auth = provider.authHeader === 'x-api-key' ? { 'x-api-key': token } : { authorization: `Bearer ${token}` };
  return { 'content-type': 'application/json', 'anthropic-version': ANTHROPIC_VERSION, ...auth };
}

/** Resolves to the response, TIMED_OUT, or { error }. The token stays inside the request. */
async function post(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => { controller.abort(); resolve(TIMED_OUT); }, timeoutMs); });
  const request = Promise.resolve()
    .then(() => fetchImpl(url, { ...init, signal: controller.signal }))
    .then(async (res) => ({ status: res.status, text: await res.text() }))
    .catch((error) => ({ error }));
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const textOf = (body) => (Array.isArray(body?.content) ? body.content : [])
  .filter((b) => b?.type === 'text' && typeof b.text === 'string')
  .map((b) => b.text)
  .join('');

/**
 * Asks the provider's Messages endpoint directly, with the same prompt the CLI judge uses, so its
 * tokens and latency carry no CLI system prompt or cold start. Never throws; never returns the token.
 */
export async function apiJudge({ state, questions, provider, env, model, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  try {
    const token = env?.[provider.authTokenEnv];
    if (!token) return { ok: false, reason: 'no_api_key' };
    const started = Date.now();
    const body = JSON.stringify({ model, max_tokens: MAX_TOKENS, messages: [{ role: 'user', content: buildJudgePrompt(state, questions) }] });
    const res = await post(fetchImpl, messagesUrl(provider), { method: 'POST', headers: headersFor(provider, token), body }, timeoutMs);
    if (res === TIMED_OUT || res.error?.name === 'AbortError') return { ok: false, reason: 'api_timeout' };
    if (res.error) return { ok: false, reason: 'api_network' };
    if (res.status < 200 || res.status >= 300) return { ok: false, reason: `api_http_${res.status}` };
    let parsedBody;
    try { parsedBody = JSON.parse(res.text); } catch { return { ok: false, reason: 'judge_parse' }; }
    const parsed = parseJudgeAnswers(textOf(parsedBody), questions);
    if (!parsed.ok) return { ok: false, reason: 'judge_parse' };
    const usage = { input_tokens: parsedBody.usage?.input_tokens ?? 0, output_tokens: parsedBody.usage?.output_tokens ?? 0 };
    return { ok: true, answers: parsed.answers, meta: { latencyMs: Date.now() - started, usage, model: parsedBody.model ?? model } };
  } catch {
    return { ok: false, reason: 'internal' };
  }
}

/** A drop-in for decide(): same signature and logging as makeJudgeDecide, answers from the direct API judge. */
export function makeApiJudgeDecide({ provider, env, model, fetchImpl = fetch, timeoutMs = Number(env?.JEV_JUDGE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS, loadArea = (area) => import(`../questions/${area}.mjs`) }) {
  return async (area, state, ctx = {}) => {
    const started = Date.now();
    let result;
    try {
      const mod = await loadArea(area);
      result = await apiJudge({ state, questions: mod.buildQuestions(state), provider, env, model, fetchImpl, timeoutMs });
    } catch (e) {
      result = { ok: false, reason: 'internal', detail: e?.message };
    }
    try {
      if (ctx.config?.logDir) await appendLog(ctx.config.logDir, `${area}-api`, { ts: new Date(started).toISOString(), area, model, sessionId: ctx.sessionId ?? null, ok: result.ok, reason: result.ok ? null : result.reason, latencyMs: Date.now() - started, usage: result.meta?.usage ?? null });
    } catch { /* best-effort */ }
    return result;
  };
}
