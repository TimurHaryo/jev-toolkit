import { loadConfig } from './config.mjs';
import { assertAllowedRoot, NotAllowedRoot } from './guard.mjs';
import { estimateTokens } from './tokens.mjs';
import { buildRequest, validateAnswers } from './schema.mjs';
import { postSystemOne } from './http.mjs';
import { recordingKey, readRecording, writeRecording } from './recorder.mjs';
import { appendLog } from './log.mjs';

const RETRYABLE_STATUS = (s) => s === 429 || s >= 500;

function defaultLoadArea(area) {
  return import(`../questions/${area}.mjs`);
}

async function callWithRetry({ config, body, fetchImpl }) {
  let lastFailure;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await postSystemOne({ url: config.baseUrl, apiKey: config.apiKey, body, timeoutMs: config.timeoutMs, fetchImpl });
      if (res.status >= 200 && res.status < 300) return { ok: true, body: res.body };
      lastFailure = { ok: false, reason: `http_${res.status}`, detail: res.text.slice(0, 500) };
      if (!RETRYABLE_STATUS(res.status)) return lastFailure;
    } catch (e) {
      lastFailure = { ok: false, reason: e.name === 'AbortError' ? 'timeout' : 'network', detail: e.message };
    }
  }
  return lastFailure;
}

async function obtainBody({ config, area, state, questions, fetchImpl }) {
  const key = recordingKey(state, questions);
  if (config.mode === 'replay') {
    const body = await readRecording(config.recordingsDir, area, key);
    return body ? { ok: true, body } : { ok: false, reason: 'no_recording', detail: key };
  }
  if (!config.apiKey) return { ok: false, reason: 'no_api_key' };
  const result = await callWithRetry({ config, body: buildRequest({ model: config.model, state, questions }), fetchImpl });
  if (result.ok && config.mode === 'record') await writeRecording(config.recordingsDir, area, key, result.body);
  return result;
}

/**
 * Ask Jev the area's questions about `state`. Never throws: every failure is `{ ok: false, reason }`
 * so hooks can fail open. Always logs one line.
 */
export async function decide(area, state, opts = {}) {
  const config = opts.config ?? loadConfig();
  const cwd = opts.cwd ?? process.cwd();
  const now = opts.now ?? (() => Date.now());
  const fetchImpl = opts.fetchImpl ?? fetch;
  const started = now();
  const base = { ts: new Date(started).toISOString(), area, sessionId: opts.sessionId ?? null, mode: config.mode, model: config.model };

  const finish = async (result, extra = {}) => {
    await appendLog(config.logDir, area, { ...base, ...extra, latencyMs: now() - started, ok: result.ok, reason: result.ok ? null : result.reason, answers: result.ok ? result.answers : null });
    return result;
  };

  if (config.disabled) return { ok: false, reason: 'disabled' };

  try {
    assertAllowedRoot(cwd, config.allowedRoots);
  } catch (e) {
    if (e instanceof NotAllowedRoot) return finish({ ok: false, reason: e.code, detail: cwd });
    throw e;
  }

  let mod;
  try {
    mod = await (opts.loadArea ?? defaultLoadArea)(area);
  } catch (e) {
    return finish({ ok: false, reason: 'area_load', detail: e.message });
  }

  let sentState = state;
  let truncated = false;
  if (estimateTokens(state) > config.maxStateTokens) {
    sentState = mod.truncate(state);
    truncated = true;
  }
  const questions = mod.buildQuestions(sentState);
  const extra = { questionVersion: mod.version, stateChars: JSON.stringify(sentState).length, estTokens: estimateTokens(sentState), truncated };

  const got = await obtainBody({ config, area, state: sentState, questions, fetchImpl });
  if (!got.ok) return finish(got, extra);

  const valid = validateAnswers(questions, got.body);
  if (!valid.ok) return finish({ ok: false, reason: 'schema', detail: valid.detail }, extra);

  return finish({
    ok: true,
    answers: valid.answers,
    meta: { latencyMs: now() - started, model: config.model, truncated, mode: config.mode, questionVersion: mod.version },
  }, extra);
}
