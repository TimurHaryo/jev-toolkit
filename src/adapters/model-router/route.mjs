import { loadConfig } from '../../client/config.mjs';
import { decide } from '../../client/jev-client.mjs';
import { thresholds } from '../../questions/model-router.mjs';

const AREA = 'model-router';

/** Picks a model tier for a subagent brief; falls back to the heavier tier when Jev is unsure. */
export async function route(brief, opts = {}) {
  const config = opts.config ?? loadConfig();
  const started = Date.now();
  const r = await (opts.decideImpl ?? decide)(AREA, { brief }, { cwd: opts.cwd ?? process.cwd(), sessionId: 'model-router', config, fetchImpl: opts.fetchImpl ?? fetch });
  if (!r.ok) return { tier: null, error: `${r.reason}${r.detail ? `: ${r.detail}` : ''}` };
  const { tier, needs_broad_exploration, asks_for_change } = r.answers;
  const change = asks_for_change.noul;
  const fallback = tier.confidence < thresholds.confidence;
  return {
    tier: fallback ? (change >= 0.5 ? 'opus' : 'sonnet') : tier.choice,
    confidence: tier.confidence,
    probabilities: tier.probabilities,
    needs_broad_exploration: needs_broad_exploration.noul,
    asks_for_change: change,
    fallback_used: fallback,
    latency_ms: Date.now() - started,
  };
}
