import { estimateTokens } from '../../client/tokens.mjs';

const HEADER = 'Project rules selected for this task (JEV):\n\n';

/** Pure: ranks sections by relevance probability and fits them into the token budget. */
export function selectSections({ answers, sections, threshold, budgetTokens, alreadyInjected }) {
  const ranked = sections
    .filter((s) => !alreadyInjected.has(s.id))
    .map((s) => ({ s, p: answers[`relevant_${s.id}`]?.noul ?? 0 }))
    .filter(({ p }) => p >= threshold)
    .sort((a, b) => b.p - a.p);
  const chosen = [];
  let used = 0;
  for (const { s } of ranked) {
    const cost = estimateTokens(s.body);
    if (used + cost > budgetTokens) continue;
    used += cost;
    chosen.push(s.id);
  }
  return chosen;
}

export function renderContext(selected) {
  return HEADER + selected.map((s) => s.body.trim()).join('\n\n') + '\n';
}
