import { join } from 'node:path';
import { loadConfig } from '../../client/config.mjs';
import { isAllowedRoot } from '../../client/guard.mjs';
import { appendLog } from '../../client/log.mjs';
import { decide } from '../../client/jev-client.mjs';
import { extractComments } from './comments.mjs';
import { applyFilters } from './filters.mjs';
import { evaluate, formatReason } from './decision.mjs';
import { editHash, bumpDenyCount, MAX_DENIES } from './session-state.mjs';
import { thresholds, MAX_COMMENTS } from '../../questions/comment-policy.mjs';

const KOTLIN = /\.kts?$/;
const AREA = 'comment-policy';

const ALLOW = { output: null, exitCode: 0 };

function hookOutput(fields) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', ...fields } };
}

function textOf(input) {
  const t = input.tool_input ?? {};
  if (input.tool_name === 'Write') return t.content;
  if (input.tool_name === 'MultiEdit') return (t.edits ?? []).map((e) => e?.new_string ?? '').join('\n');
  return t.new_string;
}

function toState(chunk) {
  return { comments: chunk.map((c, i) => ({ id: i, text: c.text, kind: c.kind, code_after: c.codeAfter })) };
}

async function skipLog(config, fields) {
  try {
    await appendLog(config.logDir, AREA, { ts: new Date().toISOString(), area: AREA, event: 'skipped', ...fields });
  } catch {
    /* logging is best-effort */
  }
}

/** Chunks run concurrently so a long file cannot spend N x timeoutMs and outrun the hook timeout. */
async function askJev(remaining, ctx) {
  try {
    const chunks = [];
    for (let start = 0; start < remaining.length; start += MAX_COMMENTS) {
      chunks.push({ start, comments: remaining.slice(start, start + MAX_COMMENTS) });
    }
    const results = await Promise.all(chunks.map((c) =>
      ctx.decideImpl(AREA, toState(c.comments), { cwd: ctx.cwd, sessionId: ctx.sessionId, config: ctx.config, fetchImpl: ctx.fetchImpl })));
    if (results.some((r) => !r?.ok)) return null;

    const merged = {};
    results.forEach((r, i) => {
      const { start } = chunks[i];
      for (const [k, v] of Object.entries(r.answers)) {
        const m = k.match(/^(.*)_(\d+)$/);
        if (!m) continue;
        merged[`${m[1]}_${Number(m[2]) + start}`] = v;
      }
    });
    return merged;
  } catch {
    return null;
  }
}

/** Pure-ish entry used by the bin and by tests. Never throws; every failure is allow. */
export async function runCommentPolicy(input, opts = {}) {
  try {
    const config = opts.config ?? loadConfig();
    const fetchImpl = opts.fetchImpl ?? fetch;
    const decideImpl = opts.decideImpl ?? decide;
    if (config.disabled) return ALLOW;

    const cwd = input.cwd ?? process.cwd();
    if (config.configMissing || !isAllowedRoot(cwd, config.allowedRoots)) {
      await skipLog(config, { reason: config.configMissing ? 'config_missing' : 'not_allowed_root', cwd });
      return ALLOW;
    }

    const filePath = input.tool_input?.file_path ?? '';
    const text = textOf(input);
    if (!KOTLIN.test(filePath) || typeof text !== 'string' || !text) return ALLOW;

    const { deterministic, remaining } = applyFilters(extractComments(text));
    if (!deterministic.length && !remaining.length) return ALLOW;

    const ctx = { config, fetchImpl, decideImpl, cwd, sessionId: input.session_id ?? null };
    const answers = remaining.length ? await askJev(remaining, ctx) : null;
    const { level, items } = evaluate({ deterministic, remaining, answers, thresholds });
    if (level === 'allow') return ALLOW;

    const reason = formatReason(level, items);
    if (level === 'advise') return { output: hookOutput({ permissionDecision: 'allow', additionalContext: reason }), exitCode: 0 };

    const count = await bumpDenyCount(join(config.logDir, 'state'), ctx.sessionId, editHash(filePath, text));
    if (count > MAX_DENIES) {
      return { output: hookOutput({ permissionDecision: 'allow', additionalContext: `${reason}\nThis edit was denied twice already; allowing to avoid a loop. Fix the comments in a follow-up.` }), exitCode: 0 };
    }
    return { output: hookOutput({ permissionDecision: 'deny', permissionDecisionReason: reason }), exitCode: 0 };
  } catch {
    return ALLOW;
  }
}
