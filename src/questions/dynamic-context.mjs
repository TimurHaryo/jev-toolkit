import { noul } from '../client/schema.mjs';

export const version = '1';
export const thresholds = Object.freeze({ relevant: 0.5 });
export const MAX_PROMPT_CHARS = 8000;
// tuned: not yet; initial threshold from spec 7.4.

const TRUE = 'Carrying out `prompt` would require reading, writing, or changing something the section governs, so its rules must be followed while doing the work.';
const FALSE = 'The work described by `prompt` does not touch what the section governs; following its rules would change nothing about the result.';

export function buildQuestions(state) {
  const questions = {};
  state.sections.forEach((s, i) => {
    questions[`relevant_${s.id}`] = noul(
      `Does the section described in \`sections[${i}]\`.summary apply to the task in \`prompt\`?`,
      { true: TRUE, false: FALSE },
    );
  });
  return questions;
}

export function truncate(state) {
  return { ...state, prompt: String(state.prompt).slice(0, MAX_PROMPT_CHARS) };
}
