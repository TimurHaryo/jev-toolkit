import { join } from 'node:path';
import { loadConfig } from '../../client/config.mjs';
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
  return input.tool_name === 'Write' ? t.content : t.new_string;
}

function toState(chunk) {
  return { comments: chunk.map((c, i) => ({ id: i, text: c.text, kind: c.kind, code_after: c.codeAfter })) };
}

async function askJev(remaining, ctx) {
  const merged = {};
  for (let start = 0; start < remaining.length; start += MAX_COMMENTS) {
    const chunk = remaining.slice(start, start + MAX_COMMENTS);
    const r = await ctx.decideImpl(AREA, toState(chunk), { cwd: ctx.cwd, sessionId: ctx.sessionId, config: ctx.config, fetchImpl: ctx.fetchImpl });
    if (!r.ok) return null;
    for (const [k, v] of Object.entries(r.answers)) {
      const m = k.match(/^(.*)_(\d+)$/);
      merged[`${m[1]}_${Number(m[2]) + start}`] = v;
    }
  }
  return merged;
}

/** Pure-ish entry used by the bin and by tests. Never throws; every failure is allow. */
export async function runCommentPolicy(input, opts = {}) {
  try {
    const config = opts.config ?? loadConfig();
    const fetchImpl = opts.fetchImpl ?? fetch;
    const decideImpl = opts.decideImpl ?? decide;
    if (config.disabled) return ALLOW;
    const filePath = input.tool_input?.file_path ?? '';
    const text = textOf(input);
    if (!KOTLIN.test(filePath) || typeof text !== 'string' || !text) return ALLOW;

    const { deterministic, remaining } = applyFilters(extractComments(text));
    if (!deterministic.length && !remaining.length) return ALLOW;

    const ctx = { config, fetchImpl, decideImpl, cwd: input.cwd ?? process.cwd(), sessionId: input.session_id ?? null };
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
