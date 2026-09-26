import { estimateTokens } from '../client/tokens.mjs';
import { costFromUsage } from './pricing.mjs';

const BUCKETS = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.0000001]];

export function compareCase(expected, answers) {
  return Object.entries(expected).map(([id, exp]) => {
    const a = answers[id] ?? {};
    if (typeof exp === 'boolean') {
      const p = a.noul ?? 0;
      return { id, expected: exp, predicted: p >= 0.5, correct: (p >= 0.5) === exp, confidence: Math.max(p, 1 - p) };
    }
    return { id, expected: exp, predicted: a.choice ?? null, correct: a.choice === exp, confidence: a.confidence ?? 0 };
  });
}

function prefixOf(id) {
  return id.replace(/_\d+$/, '');
}

function precisionRecall(rows) {
  const positives = rows.filter((r) => r.expected === true);
  const predictedPositive = rows.filter((r) => r.predicted === true);
  const tp = rows.filter((r) => r.expected === true && r.predicted === true).length;
  return {
    precision: predictedPositive.length ? tp / predictedPositive.length : null,
    recall: positives.length ? tp / positives.length : null,
  };
}

export function summarize(rows) {
  const agreement = rows.length ? rows.filter((r) => r.correct).length / rows.length : 0;
  const byQuestion = {};
  for (const r of rows) {
    const k = prefixOf(r.id);
    byQuestion[k] = byQuestion[k] ?? [];
    byQuestion[k].push(r);
  }
  const byQuestionOut = Object.fromEntries(Object.entries(byQuestion).map(([k, rs]) => {
    const isBool = rs.every((r) => typeof r.expected === 'boolean');
    return [k, { n: rs.length, accuracy: rs.filter((r) => r.correct).length / rs.length, ...(isBool ? precisionRecall(rs) : { precision: null, recall: null }) }];
  }));
  const buckets = BUCKETS.map(([lo, hi]) => {
    const rs = rows.filter((r) => r.confidence >= lo && r.confidence < hi);
    return { range: `${lo.toFixed(1)}-${Math.min(hi, 1).toFixed(1)}`, n: rs.length, accuracy: rs.length ? rs.filter((r) => r.correct).length / rs.length : null };
  });
  return { agreement, byQuestion: byQuestionOut, buckets };
}

const pct = (v) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);

export function formatReport(area, summary, skipped) {
  const lines = [`JEV accuracy: ${area}`, `agreement: ${pct(summary.agreement)}`, '', 'by question:'];
  for (const [k, v] of Object.entries(summary.byQuestion)) {
    lines.push(`  ${k}: n=${v.n} accuracy=${pct(v.accuracy)} precision=${pct(v.precision)} recall=${pct(v.recall)}`);
  }
  lines.push('', 'calibration by confidence:');
  for (const b of summary.buckets) lines.push(`  ${b.range}: n=${b.n} accuracy=${pct(b.accuracy)}`);
  lines.push('', `skipped ${skipped.length}${skipped.length ? ': ' + skipped.map((s) => `#${s.index} (${s.reason})`).join(', ') : ''}`);
  return lines.join('\n');
}

const PER_M = 1_000_000;

/**
 * Latency, tokens, and USD for one successful decision; null when the judge returned nothing to measure.
 * Jev input tokens are an estimate of the request payload; the LLM judges report real usage.
 */
export function decisionCost({ judge, result, state, questions, model, pricing, jevPricePerMTok = 0.042 }) {
  if (!result?.ok || !result.meta) return null;
  const latencyMs = result.meta.latencyMs ?? null;
  if (judge === 'jev') {
    const inputTokens = estimateTokens({ state, questions });
    return { latencyMs, inputTokens, outputTokens: 0, costUsd: (inputTokens * jevPricePerMTok) / PER_M, warning: null };
  }
  const usage = result.meta.usage ?? {};
  const priced = costFromUsage(usage, model, pricing);
  return { latencyMs, inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0, costUsd: priced.cost_usd, warning: priced.warning ?? null };
}

function median(sorted) {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Nearest-rank percentile. */
const percentile = (sorted, q) => (sorted.length ? sorted[Math.ceil(q * sorted.length) - 1] : null);
const ms = (v) => (v === null ? 'n/a' : String(Math.round(v)));
const sum = (costs, key) => costs.reduce((t, c) => t + (c[key] ?? 0), 0);

export function formatCostBlock(costs, { judge, mode } = {}) {
  const latencies = costs.map((c) => c.latencyMs).filter((v) => typeof v === 'number').sort((a, b) => a - b);
  const replay = judge === 'jev' && mode === 'replay' ? ' (replay)' : '';
  const est = judge === 'jev' ? ' (est)' : '';
  const unpriced = costs.some((c) => c.costUsd === null);
  const cost = unpriced ? 'n/a' : sum(costs, 'costUsd').toFixed(6);
  const line = `decisions ${costs.length} · latency ms median ${ms(median(latencies))} / p90 ${ms(percentile(latencies, 0.9))}${replay} · input tokens ${sum(costs, 'inputTokens')}${est} · output tokens ${sum(costs, 'outputTokens')} · cost USD ${cost}`;
  const warnings = [...new Set(costs.map((c) => c.warning).filter(Boolean))].map((w) => `warning: ${w}`);
  return [line, ...warnings].join('\n');
}

/** One --dump record: the case outcome and the rows compareCase produced for it. */
export function dumpLine({ index, result, rows }) {
  return {
    index,
    ok: Boolean(result?.ok),
    ...(result?.ok ? {} : { reason: result?.reason ?? 'unknown' }),
    latencyMs: result?.meta?.latencyMs ?? null,
    rows: rows.map(({ id, expected, predicted, confidence, correct }) => ({ id, expected, predicted, confidence, correct })),
  };
}
