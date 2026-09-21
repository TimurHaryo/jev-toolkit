import { noul } from '../../../src/client/schema.mjs';
export const version = 'test-1';
export const thresholds = { deny: 0.8 };
export function buildQuestions(state) {
  return { yes: noul(`Is "${state.text}" affirmative?`) };
}
export function truncate(state) {
  return { ...state, text: state.text.slice(0, 10), truncatedBy: 'echo' };
}
