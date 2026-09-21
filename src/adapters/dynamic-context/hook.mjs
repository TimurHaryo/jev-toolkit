import { join } from 'node:path';
import { loadConfig } from '../../client/config.mjs';
import { isAllowedRoot } from '../../client/guard.mjs';
import { appendLog } from '../../client/log.mjs';
import { decide } from '../../client/jev-client.mjs';
import { loadRules } from '../../targets/rules.mjs';
import { thresholds } from '../../questions/dynamic-context.mjs';
import { selectSections, renderContext } from './sections.mjs';
import { readInjected, markInjected } from './session-state.mjs';

const AREA = 'dynamic-context';
const NOTHING = { output: null, exitCode: 0 };

async function skipLog(config, fields) {
  try { await appendLog(config.logDir, AREA, { ts: new Date().toISOString(), area: AREA, event: 'skipped', ...fields }); } catch { /* best-effort */ }
}

/** Never throws; every failure injects nothing. */
export async function runDynamicContext(input, opts = {}) {
  try {
    const config = opts.config ?? loadConfig();
    const fetchImpl = opts.fetchImpl ?? fetch;
    const decideImpl = opts.decideImpl ?? decide;
    const loadRulesImpl = opts.loadRulesImpl ?? loadRules;
    if (config.disabled) return NOTHING;
    const cwd = input.cwd ?? process.cwd();
    if (config.configMissing || !isAllowedRoot(cwd, config.allowedRoots)) {
      await skipLog(config, { reason: config.configMissing ? 'config_missing' : 'not_allowed_root', cwd });
      return NOTHING;
    }
    const prompt = (input.user_prompt ?? input.prompt ?? '').trim();
    if (!prompt) return NOTHING;

    let rules;
    try { rules = await loadRulesImpl(join(cwd, '.claude', 'jev-rules')); } catch { return NOTHING; }
    const stateDir = join(config.logDir, 'state', AREA);
    const already = await readInjected(stateDir, input.session_id);
    const candidates = rules.filter((r) => !r.always && !already.has(r.id));
    if (!candidates.length) return NOTHING;

    const r = await decideImpl(AREA, { prompt, sections: candidates.map((s) => ({ id: s.id, summary: s.summary })) }, { cwd, sessionId: input.session_id ?? null, config, fetchImpl });
    if (!r.ok) return NOTHING;

    const ids = selectSections({ answers: r.answers, sections: candidates, threshold: thresholds.relevant, budgetTokens: config.contextBudgetTokens, alreadyInjected: already });
    if (!ids.length) return NOTHING;
    const selected = ids.map((id) => candidates.find((s) => s.id === id));
    await markInjected(stateDir, input.session_id, ids);
    return { output: { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: renderContext(selected) } }, exitCode: 0 };
  } catch {
    return NOTHING;
  }
}
