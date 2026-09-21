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
