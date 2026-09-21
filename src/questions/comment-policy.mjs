import { noul, choice } from '../client/schema.mjs';

export const version = '1';
export const thresholds = Object.freeze({ deny: 0.8, advise: 0.5 });
export const MAX_COMMENTS = 20;
export const MAX_CODE_AFTER_CHARS = 200;
// tuned: not yet; initial values from spec 7.1. Re-tune only from bin/jev-accuracy output.

const NARRATES_TRUE = 'The comment describes the operation that `code_after` visibly performs, using the same nouns and verbs as the code, and adds no reason, constraint, warning, or context that the code itself does not show.';
const NARRATES_FALSE = 'The comment explains why the code exists or is shaped this way: a workaround, an ordering constraint, a platform quirk, a race, a deliberate deviation; or it is a one-line summary of what a public class, object, or interface is for.';
const SIGNATURE_TRUE = 'The KDoc only repeats parameter names, parameter types, or the return type that already appear in `code_after`, with no meaning beyond the signature.';
const SIGNATURE_FALSE = 'The KDoc states a purpose, a precondition, a side effect, or a return meaning that the signature alone does not convey.';

const KIND_CRITERIA = Object.freeze({
  narration: 'Restates what the following code does',
  reason: 'Explains why: workaround, constraint, quirk, race, deliberate deviation',
  public_summary: 'One-line summary of what a public type or function is for',
  todo: 'Marks future work or a known gap',
  other: null,
});

export function buildQuestions(state) {
  const questions = {};
  state.comments.forEach((c, i) => {
    const ref = `\`comments[${i}]\``;
    questions[`narrates_${i}`] = noul(
      `Does ${ref}.text merely narrate what ${ref}.code_after does?`,
      { true: NARRATES_TRUE, false: NARRATES_FALSE },
    );
    if (c.kind === 'kdoc') {
      questions[`restates_signature_${i}`] = noul(
        `Does ${ref}.text only restate the signature in ${ref}.code_after?`,
        { true: SIGNATURE_TRUE, false: SIGNATURE_FALSE },
      );
    }
    questions[`kind_${i}`] = choice(`What kind of comment is ${ref}.text?`, KIND_CRITERIA);
  });
  return questions;
}

export function truncate(state) {
  return {
    comments: state.comments.slice(0, MAX_COMMENTS).map((c) => ({ ...c, code_after: c.code_after.slice(0, MAX_CODE_AFTER_CHARS) })),
  };
}
