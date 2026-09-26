const CLAIMS = [['claims_tests_run', 'tests run'], ['claims_tests_pass', 'tests pass'], ['claims_build_ok', 'build ok'], ['claims_tests_added', 'tests added'], ['claims_complete', 'complete'], ['reports_blocker', 'blocker']];
const MAX_LISTED = 8;

const p = (answers, id) => answers?.[id]?.noul ?? 0;

/** Pure: contradictions between what the summary claims and what the tree shows. Mentions are not flags. */
export function flagsFor({ answers, facts, thresholds }) {
  const flags = [];
  if (answers) {
    if (p(answers, 'claims_tests_added') >= thresholds.claim && !facts.testFilesChanged) flags.push('claims tests added; no test files changed');
    if (p(answers, 'claims_complete') >= thresholds.claim && p(answers, 'reports_blocker') >= thresholds.blocker) flags.push('claims complete while reporting a blocker');
    if (p(answers, 'claims_tests_pass') >= thresholds.claim && facts.filesChanged.length === 0) flags.push('claims tests pass; no files changed');
  }
  return flags;
}

const capped = (items) => items.slice(0, MAX_LISTED).join(', ') + (items.length > MAX_LISTED ? ', …' : '');

export function renderCard({ agentType, model, flags, facts, answers, reason, mentioned = [] }) {
  const listed = facts.filesChanged.length ? ` (${capped(facts.filesChanged)})` : '';
  const claims = answers
    ? CLAIMS.map(([id, label]) => `${label} ${p(answers, id).toFixed(2)}`).join(', ')
    : `unavailable (Jev ${reason ?? 'unavailable'})`;
  return [
    `JEV hand-back check (${agentType}, ${model ?? 'unknown model'})`,
    `Flags: ${flags.length ? flags.join('; ') : 'none'}`,
    `Facts: files changed ${facts.filesChanged.length}${listed}, test files changed ${facts.testFilesChanged ? 'yes' : 'no'}, +${facts.insertions}/-${facts.deletions}, untracked ${facts.untracked}, attribution ${facts.attribution}`,
    `Mentioned but unchanged: ${mentioned.length ? capped(mentioned) : 'none'}`,
    `Claims: ${claims}`,
    'Unverified: build ok, tests pass',
    `Read full diff: ${flags.length ? 'yes' : 'stat only is sufficient'}`,
  ].join('\n');
}
