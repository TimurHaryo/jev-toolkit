import { noul } from '../client/schema.mjs';

export const version = '1';
export const thresholds = Object.freeze({ claim: 0.8, blocker: 0.5 });
export const MAX_SUMMARY_CHARS = 12000;
// tuned: not yet; initial thresholds from spec 7.2.

const Q = {
  claims_tests_run: ['`summary` states that tests were executed.', 'It names a test command that was run, or says tests were run or executed.', 'It never says tests were run; at most it says tests exist or should be run.'],
  claims_tests_pass: ['`summary` states that tests passed.', 'It says tests pass, are green, or reports a pass count with zero failures.', 'It reports failures, does not mention results, or only says tests were written.'],
  claims_build_ok: ['`summary` states that the build or compile succeeded.', 'It says the build, compile, or type check passed or is green.', 'It does not mention the build, or reports a build failure.'],
  claims_tests_added: ['`summary` states that new tests were written.', 'It says tests were added, written, or created, or names new test files.', 'It mentions no new tests, or only that existing tests were run.'],
  claims_complete: ['`summary` presents the work as finished with nothing left out.', 'It says done, complete, implemented, or lists every requested item as delivered without exceptions.', 'It says partial, remaining, skipped, blocked, or lists items not done.'],
  reports_blocker: ['`summary` reports something skipped, failed, or blocked.', 'It names a step that could not be done, a failing check, a missing dependency, or asks for a decision.', 'It reports no problems and asks for nothing.'],
};

export function buildQuestions() {
  return Object.fromEntries(Object.entries(Q).map(([id, [instructions, t, f]]) => [id, noul(instructions, { true: t, false: f })]));
}

export function truncate(state) {
  return { ...state, summary: String(state.summary).slice(0, MAX_SUMMARY_CHARS) };
}
