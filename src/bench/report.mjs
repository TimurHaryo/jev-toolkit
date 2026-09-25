import { readFile } from 'node:fs/promises';

const sortNums = (xs) => xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
export function median(nums) { const s = sortNums(nums); if (!s.length) return null; const m = s.length / 2; return s.length % 2 ? s[Math.floor(m)] : (s[m - 1] + s[m]) / 2; }
export function p90(nums) { const s = sortNums(nums); if (!s.length) return null; return s[Math.max(0, Math.ceil(0.9 * s.length) - 1)]; }
const mean = (nums) => { const s = sortNums(nums); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; };
const rate = (vals) => { const b = vals.filter((v) => typeof v === 'boolean'); return b.length ? b.filter(Boolean).length / b.length : null; };

export async function readLabels(path) {
  try { return (await readFile(path, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}

export function applyLabels(records, labels) {
  return records.map((r) => {
    const l = labels.find((x) => x.area === r.area && x.arm === r.arm && x.task === r.task && x.rep === r.rep);
    return l ? { ...r, quality: { ...r.quality, violations_remaining: l.violations_remaining } } : r;
  });
}

const METRICS = { input_tokens: (r) => r.usage?.input_tokens, cache_read_input_tokens: (r) => r.usage?.cache_read_input_tokens, output_tokens: (r) => r.usage?.output_tokens, cost_usd: (r) => r.cost_usd, duration_ms: (r) => r.duration_ms, num_turns: (r) => r.num_turns };
const QUALITY = ['gold_sections_recall', 'gold_sections_precision', 'violations_remaining', 'flags_raised'];

function armSummary(rs) {
  const metrics = Object.fromEntries(Object.entries(METRICS).map(([k, f]) => [k, { median: median(rs.map(f)), p90: p90(rs.map(f)) }]));
  const quality = Object.fromEntries(QUALITY.map((q) => [q, mean(rs.map((r) => r.quality?.[q]))]));
  quality.orchestrator_read_full_diff = rate(rs.map((r) => r.quality?.orchestrator_read_full_diff));
  quality.compile_pass_rate = rate(rs.map((r) => r.quality?.compile));
  const jev = { calls_per_task: mean(rs.map((r) => r.jev?.calls ?? 0)), latency_ms_median: median(rs.flatMap((r) => (r.jev?.calls ? [r.jev.latency_ms_total / r.jev.calls] : []))), cost_usd_total: rs.reduce((a, r) => a + (r.jev?.cost_usd ?? 0), 0) };
  return { n: rs.length, tasks: [...new Set(rs.map((r) => r.task))], metrics, quality, jev };
}

export function summarizeRun(records) {
  const out = { excluded: [] };
  const groups = {};
  for (const r of records) {
    if (r.subtype !== 'success') { out.excluded.push({ area: r.area, arm: r.arm, task: r.task, rep: r.rep, reason: r.error ?? r.subtype ?? 'not success' }); continue; }
    if (r.cost_usd === null || r.cost_usd === undefined) { out.excluded.push({ area: r.area, arm: r.arm, task: r.task, rep: r.rep, reason: 'cost_usd null' }); continue; }
    ((groups[r.area] ??= {})[r.arm] ??= []).push(r);
  }
  for (const [area, arms] of Object.entries(groups)) out[area] = Object.fromEntries(Object.entries(arms).map(([arm, rs]) => [arm, armSummary(rs)]));
  return out;
}

const fmt = (v, d = 0) => (v === null || v === undefined ? 'n/a' : typeof v === 'number' ? v.toFixed(d) : String(v));
const pair = (m, d = 0) => `${fmt(m.median, d)} / ${fmt(m.p90, d)}`;
const LABELS = { gold_sections_recall: 'gold sections recall', gold_sections_precision: 'gold sections precision', violations_remaining: 'violations remaining (mean)', flags_raised: 'flags raised (mean)', orchestrator_read_full_diff: 'read full diff (rate)', compile_pass_rate: 'compile pass rate' };

export function renderReport(manifest, summary) {
  const lines = [`# JEV benchmark run ${manifest.run_id}`, '', `date ${manifest.date} · provider ${manifest.provider} · models ${JSON.stringify(manifest.models)} · Claude Code ${manifest.claude_code_version} · toolkit ${manifest.toolkit_commit}`, ''];
  for (const [area, arms] of Object.entries(summary)) {
    if (area === 'excluded') continue;
    const names = Object.keys(arms).sort();
    lines.push(`## ${area}`, '', `| metric | ${names.join(' | ')} |`, `|---|${names.map(() => '---').join('|')}|`);
    const row = (label, f) => lines.push(`| ${label} | ${names.map((n) => f(arms[n])).join(' | ')} |`);
    row('n', (a) => String(a.n));
    row('input tokens (median / p90)', (a) => pair(a.metrics.input_tokens));
    row('cache read (median / p90)', (a) => pair(a.metrics.cache_read_input_tokens));
    row('output tokens (median / p90)', (a) => pair(a.metrics.output_tokens));
    row('cost USD (median / p90)', (a) => pair(a.metrics.cost_usd, 4));
    row('duration s (median / p90)', (a) => `${fmt(a.metrics.duration_ms.median / 1000, 1)} / ${fmt(a.metrics.duration_ms.p90 / 1000, 1)}`);
    row('turns (median)', (a) => fmt(a.metrics.num_turns.median, 1));
    for (const [q, label] of Object.entries(LABELS)) if (names.some((n) => arms[n].quality[q] !== null)) row(label, (a) => fmt(a.quality[q], 2));
    row('Jev calls / task', (a) => fmt(a.jev.calls_per_task, 2));
    row('Jev latency ms (median)', (a) => fmt(a.jev.latency_ms_median, 0));
    row('Jev cost USD (total)', (a) => fmt(a.jev.cost_usd_total, 6));
    lines.push('');
  }
  lines.push('## Excluded', '');
  if (!summary.excluded.length) lines.push('none');
  for (const e of summary.excluded) lines.push(`- ${e.area}/${e.arm} ${e.task} r${e.rep}: ${e.reason}`);
  return lines.join('\n') + '\n';
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
