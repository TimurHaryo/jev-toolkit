import { readFile } from 'node:fs/promises';
import { costFromUsage, costFromModelUsage } from './pricing.mjs';

const sortNums = (xs) => xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
export function median(nums) { const s = sortNums(nums); if (!s.length) return null; const m = s.length / 2; return s.length % 2 ? s[Math.floor(m)] : (s[m - 1] + s[m]) / 2; }
export function p90(nums) { const s = sortNums(nums); if (!s.length) return null; return s[Math.max(0, Math.ceil(0.9 * s.length) - 1)]; }
const mean = (nums) => { const s = sortNums(nums); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; };
const rate = (vals) => { const b = vals.filter((v) => typeof v === 'boolean'); return b.length ? b.filter(Boolean).length / b.length : null; };

/** Hand-labels for a run. A missing file means no labels; an unreadable or malformed one is an error. */
export async function readLabels(path) {
  let text;
  try { text = await readFile(path, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  return text.split('\n').flatMap((l, i) => {
    if (!l.trim()) return [];
    try { return [JSON.parse(l)]; } catch { throw new Error(`labels file ${path}: line ${i + 1} is not valid JSON`); }
  });
}

const sameRun = (l, r) => l.area === r.area && l.arm === r.arm && l.task === r.task && l.rep === r.rep;

/** Applies hand-labels; `unmatched` lists labels that name no record (usually a typo in the labels file). */
export function applyLabels(records, labels) {
  const out = records.map((r) => {
    const l = labels.find((x) => sameRun(x, r));
    return l ? { ...r, quality: { ...r.quality, violations_remaining: l.violations_remaining } } : r;
  });
  return { records: out, unmatched: labels.filter((l) => !records.some((r) => sameRun(l, r))) };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function recomputeCost(r, pricing) {
  const perModel = r.usage?.per_model ?? {};
  if (Object.keys(perModel).length) return costFromModelUsage(perModel, pricing);
  const c = costFromUsage(r.usage, r.orchestrator_model, pricing);
  return { cost_usd: c.cost_usd, warnings: c.warning ? [c.warning] : [] };
}

function recomputeJev(jev, pricing, jevPricePerMTok) {
  const judge = costFromModelUsage(jev.judge_usage ?? {}, pricing);
  const cost = judge.cost_usd === null ? null : ((jev.est_tokens ?? 0) / 1e6) * jevPricePerMTok + judge.cost_usd;
  return { jev: { ...jev, cost_usd: cost }, warnings: judge.warnings };
}

const isMissing = (v) => v === null || v === undefined;

/** Reprices one record; `force` recomputes known costs too, otherwise only the missing ones. */
function repriceRecord(r, pricing, jevPricePerMTok, force) {
  if (!r.usage) return r;
  const mainDo = force || isMissing(r.cost_usd);
  const jevDo = Boolean(r.jev) && (force || isMissing(r.jev.cost_usd));
  if (!mainDo && !jevDo) return r;
  const main = mainDo ? recomputeCost(r, pricing) : { cost_usd: r.cost_usd, warnings: [] };
  const side = jevDo ? recomputeJev(r.jev, pricing, jevPricePerMTok) : { jev: r.jev, warnings: [] };
  return { ...r, cost_usd: main.cost_usd, cost_warnings: [...main.warnings, ...side.warnings], ...(side.jev ? { jev: side.jev } : {}) };
}

/**
 * Recomputes costs that were unknown when the run was recorded (a price added later), from the usage
 * stored in each record. Records with a known cost, and records without usage, come back unchanged.
 */
export function applyPricing(records, pricing, jevPricePerMTok = 0.042) {
  return records.map((r) => repriceRecord(r, pricing, jevPricePerMTok, false));
}

/** Recomputes every cost (main and side-channel) from stored usage with the current prices. Records without usage are unchanged. */
export function repriceAll(records, pricing, jevPricePerMTok = 0.042) {
  return records.map((r) => repriceRecord(r, pricing, jevPricePerMTok, true));
}

const promptTokens = (r) => (r.usage ? (r.usage.input_tokens ?? 0) + (r.usage.cache_read_input_tokens ?? 0) + (r.usage.cache_creation_input_tokens ?? 0) : undefined);
const METRICS = { input_tokens: (r) => r.usage?.input_tokens, cache_read_input_tokens: (r) => r.usage?.cache_read_input_tokens, prompt_tokens_total: promptTokens, output_tokens: (r) => r.usage?.output_tokens, duration_ms: (r) => r.duration_ms, num_turns: (r) => r.num_turns, permission_denials: (r) => r.permission_denials?.count };
const QUALITY = ['gold_sections_recall', 'gold_sections_precision', 'violations_remaining', 'flags_raised'];

function mergeHistograms(hs) {
  const out = {};
  for (const h of hs) for (const [k, v] of Object.entries(h ?? {})) out[k] = (out[k] ?? 0) + v;
  return out;
}

const countValues = (xs) => xs.reduce((h, x) => ({ ...h, [x]: (h[x] ?? 0) + 1 }), {});

function armSummary(rs, excluded) {
  const priced = rs.filter((r) => isNum(r.cost_usd));
  const metrics = Object.fromEntries(Object.entries(METRICS).map(([k, f]) => [k, { median: median(rs.map(f)), p90: p90(rs.map(f)) }]));
  metrics.cost_usd = { median: median(priced.map((r) => r.cost_usd)), p90: p90(priced.map((r) => r.cost_usd)) };
  const quality = Object.fromEntries(QUALITY.map((q) => [q, mean(rs.map((r) => r.quality?.[q]))]));
  quality.orchestrator_read_full_diff = rate(rs.map((r) => r.quality?.orchestrator_read_full_diff));
  quality.compile_pass_rate = rate(rs.map((r) => r.quality?.compile));
  const called = rs.filter((r) => r.jev?.calls);
  const jev = {
    calls_per_task: mean(rs.map((r) => r.jev?.calls ?? 0)),
    ok_rate: called.length ? mean(called.map((r) => (r.jev.ok_calls ?? 0) / r.jev.calls)) : null,
    reasons: mergeHistograms(rs.map((r) => r.jev?.reasons)),
    latency_ms_median: median(called.map((r) => r.jev.latency_ms_total / r.jev.calls)),
    cost_usd_total: rs.reduce((a, r) => a + (isNum(r.jev?.cost_usd) ? r.jev.cost_usd : 0), 0),
  };
  const denied_commands = countValues(rs.flatMap((r) => r.permission_denials?.commands ?? []));
  return { n: rs.length, n_priced: priced.length, incomplete: rs.filter((r) => r.subtype !== 'success').length, excluded, tasks: [...new Set(rs.map((r) => r.task))], metrics, quality, jev, denied_commands };
}

const where = (r) => ({ area: r.area, arm: r.arm, task: r.task, rep: r.rep });

/**
 * Records without usage that did not succeed are excluded. Every other record (including incomplete
 * ones such as error_max_turns) counts in tokens, duration, and turns; cost uses only priced records.
 * Every arm that has a record gets a column, even when all of its records were excluded.
 */
export function summarizeRun(records) {
  const out = { excluded: [] };
  const groups = {};
  for (const r of records) {
    const g = ((groups[r.area] ??= {})[r.arm] ??= { included: [], excluded: 0 });
    if (r.subtype !== 'success' && !r.usage) {
      out.excluded.push({ ...where(r), scope: 'run', reason: r.error ?? r.subtype ?? 'not success' });
      g.excluded += 1;
      continue;
    }
    g.included.push(r);
    if (!isNum(r.cost_usd)) {
      const warnings = r.cost_warnings?.length ? `: ${r.cost_warnings.join('; ')}` : '';
      out.excluded.push({ ...where(r), scope: 'cost', reason: `cost_usd null (excluded from cost only)${warnings}` });
    }
  }
  for (const [area, arms] of Object.entries(groups)) out[area] = Object.fromEntries(Object.entries(arms).map(([arm, g]) => [arm, armSummary(g.included, g.excluded)]));
  return out;
}

const fmt = (v, d = 0) => (v === null || v === undefined ? 'n/a' : typeof v === 'number' ? v.toFixed(d) : String(v));
const pair = (m, d = 0) => `${fmt(m.median, d)} / ${fmt(m.p90, d)}`;
const seconds = (ms) => (isNum(ms) ? ms / 1000 : null);
const pct = (v) => (isNum(v) ? `${(v * 100).toFixed(0)}%` : 'n/a');
const histogram = (h) => (Object.keys(h ?? {}).length ? Object.entries(h).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(', ') : 'none');
const LABELS = { gold_sections_recall: 'gold sections recall', gold_sections_precision: 'gold sections precision', violations_remaining: 'violations remaining (mean)', flags_raised: 'flags raised (mean)', orchestrator_read_full_diff: 'read full diff (rate)', compile_pass_rate: 'compile pass rate' };

const HOW_TO_READ = [
  'How to read:',
  '',
  "- Token rows are the orchestrator's main thread (the session's own usage). Cost includes every model the session used, subagents too; side-channel cost is its own row.",
  '- Prompt tokens total is input + cache read + cache write. Cache reads depend on run order: an arm run after another can reuse a cache the earlier one warmed.',
  '- n counts runs with usage, including incomplete ones (see incomplete runs); cost rows use only priced runs (n priced). Excluded runs had no usage at all.',
  '- Hand-back n is the number of subagent tasks (three per rep), not all tasks.',
  '',
];

const TOP_DENIED = 10;

function deniedSection(summary) {
  const lines = ['## Denied commands', ''];
  for (const [area, arms] of Object.entries(summary)) {
    if (area === 'excluded') continue;
    for (const arm of Object.keys(arms).sort()) {
      const top = Object.entries(arms[arm].denied_commands ?? {}).sort(([a, x], [b, y]) => y - x || a.localeCompare(b)).slice(0, TOP_DENIED);
      if (!top.length) continue;
      lines.push(`### ${area} / ${arm}`, '', ...top.map(([c, n]) => `- ${n} × \`${c.replace(/`/g, "'")}\``), '');
    }
  }
  if (lines.length === 2) lines.push('none', '');
  return lines;
}

export function renderReport(manifest, summary, { repriced = false } = {}) {
  const header = `date ${manifest.date} · provider ${manifest.provider} · models ${JSON.stringify(manifest.models)} · Claude Code ${manifest.claude_code_version} · toolkit ${manifest.toolkit_commit}${repriced ? ' · costs repriced from current config' : ''}`;
  const lines = [`# JEV benchmark run ${manifest.run_id}`, '', header, '', ...HOW_TO_READ];
  for (const [area, arms] of Object.entries(summary)) {
    if (area === 'excluded') continue;
    const names = Object.keys(arms).sort();
    lines.push(`## ${area}`, '', `| metric | ${names.join(' | ')} |`, `|---|${names.map(() => '---').join('|')}|`);
    const row = (label, f) => lines.push(`| ${label} | ${names.map((n) => f(arms[n])).join(' | ')} |`);
    row('n', (a) => String(a.n));
    row('incomplete runs', (a) => String(a.incomplete));
    row('excluded runs', (a) => String(a.excluded));
    row('n priced', (a) => String(a.n_priced));
    row('input tokens (median / p90)', (a) => pair(a.metrics.input_tokens));
    row('cache read (median / p90)', (a) => pair(a.metrics.cache_read_input_tokens));
    row('prompt tokens total (median / p90)', (a) => pair(a.metrics.prompt_tokens_total));
    row('output tokens (median / p90)', (a) => pair(a.metrics.output_tokens));
    row('cost USD (median / p90)', (a) => pair(a.metrics.cost_usd, 4));
    row('duration s (median / p90)', (a) => `${fmt(seconds(a.metrics.duration_ms.median), 1)} / ${fmt(seconds(a.metrics.duration_ms.p90), 1)}`);
    row('turns (median)', (a) => fmt(a.metrics.num_turns.median, 1));
    row('permission denials (median / p90)', (a) => pair(a.metrics.permission_denials));
    for (const [q, label] of Object.entries(LABELS)) if (names.some((n) => arms[n].quality[q] !== null)) row(label, (a) => fmt(a.quality[q], 2));
    row('side-channel calls / task', (a) => fmt(a.jev.calls_per_task, 2));
    row('side-channel ok rate', (a) => pct(a.jev.ok_rate));
    row('side-channel failures', (a) => histogram(a.jev.reasons));
    row('Jev latency ms (median)', (a) => fmt(a.jev.latency_ms_median, 0));
    row('Jev cost USD (total)', (a) => fmt(a.jev.cost_usd_total, 6));
    lines.push('');
  }
  lines.push('## Excluded', '');
  if (!summary.excluded.length) lines.push('none');
  for (const e of summary.excluded) lines.push(`- ${e.area}/${e.arm} ${e.task} r${e.rep}: ${e.reason}`);
  lines.push('', ...deniedSection(summary));
  return lines.join('\n').trimEnd() + '\n';
}

export function compareRuns(a, b) {
  const lines = [`# Compare ${a.manifest.run_id} vs ${b.manifest.run_id}`, ''];
  const delta = (x, y, d) => (x === null || y === null ? 'n/a' : `${y - x >= 0 ? '+' : ''}${(y - x).toFixed(d)}`);
  for (const area of Object.keys(a.summary).filter((k) => k !== 'excluded' && b.summary[k])) {
    for (const arm of Object.keys(a.summary[area]).filter((k) => b.summary[area][k])) {
      const x = a.summary[area][arm]; const y = b.summary[area][arm];
      lines.push(`## ${area} / ${arm}`, '', `| metric | ${a.manifest.run_id} | ${b.manifest.run_id} | delta |`, '|---|---|---|---|');
      const row = (label, gx, gy, d) => lines.push(`| ${label} | ${fmt(gx, d)} | ${fmt(gy, d)} | ${delta(gx, gy, d)} |`);
      row('input tokens median', x.metrics.input_tokens.median, y.metrics.input_tokens.median, 0);
      row('cost median', x.metrics.cost_usd.median, y.metrics.cost_usd.median, 4);
      row('duration median', x.metrics.duration_ms.median, y.metrics.duration_ms.median, 0);
      row('gold recall', x.quality.gold_sections_recall, y.quality.gold_sections_recall, 2);
      row('flags raised', x.quality.flags_raised, y.quality.flags_raised, 2);
      lines.push('');
    }
  }
  return lines.join('\n') + '\n';
}
