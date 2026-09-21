import { RULES } from './filters.mjs';

const POLICY = 'Policy: comments explain why, never what. Delete narration; keep or rewrite only comments that carry a reason the code cannot show.';

function jevItems(remaining, answers, thresholds) {
  if (!answers) return [];
  const items = [];
  remaining.forEach((comment, i) => {
    const checks = [
      [RULES.NARRATION, answers[`narrates_${i}`]?.noul],
      [RULES.RESTATES_SIGNATURE, answers[`restates_signature_${i}`]?.noul],
    ];
    for (const [rule, p] of checks) {
      if (typeof p === 'number' && p >= thresholds.advise) {
        items.push({ line: comment.line, text: comment.text, rule, probability: p });
      }
    }
  });
  return items;
}

/** Pure: combines deterministic violations with Jev answers into one level and an item list. */
export function evaluate({ deterministic, remaining, answers, thresholds }) {
  const items = [
    ...deterministic.map(({ comment, rule }) => ({ line: comment.line, text: comment.text, rule, probability: 1 })),
    ...jevItems(remaining, answers, thresholds),
  ].sort((a, b) => a.line - b.line);
  const max = items.reduce((m, it) => Math.max(m, it.probability), 0);
  const level = max >= thresholds.deny ? 'deny' : max >= thresholds.advise ? 'advise' : 'allow';
  return { level, items: level === 'allow' ? [] : items };
}

export function formatReason(level, items) {
  const head = level === 'deny' ? 'JEV comment policy: write denied.' : 'JEV comment policy: advisory.';
  const lines = items.map((it) => `- line ${it.line}: ${it.rule} (p=${it.probability.toFixed(2)}) "${it.text.split('\n')[0]}"`);
  return [head, ...lines, POLICY].join('\n');
}
