import { noul, choice } from '../client/schema.mjs';

export const version = '1';
export const thresholds = Object.freeze({ confidence: 0.6 });
export const MAX_BRIEF_CHARS = 12000;
export const TIERS = Object.freeze(['haiku', 'sonnet', 'opus']);
// tuned: not yet; criteria derived from the user's routing table, initial floor from spec 7.3.

const TIER_CRITERIA = Object.freeze({
  haiku: 'A narrow lookup: find a file, grep a symbol, list where something is referenced, say which module owns a resource, answer from one or two files without judgement.',
  sonnet: 'Bounded work with a worked example or a clear pattern: trace one field across layers, follow a request through REST and WebSocket paths, write tests for an existing class, copy an established pattern across files, one simple slice inside a larger fan-out, or a build fix.',
  opus: 'Work that needs design judgement: implement a feature slice from a spec, change behaviour across several files with no template to copy, review a diff for correctness, resolve an architectural question, or anything where a wrong first attempt is expensive.',
});

export function buildQuestions() {
  return {
    tier: choice('Which model tier should carry out `brief`?', TIER_CRITERIA),
    needs_broad_exploration: noul('Does `brief` require reading several layers or many files before any answer can be given?', {
      true: 'The brief spans more than one module or layer, or asks how something flows end to end, or the relevant files are not named.',
      false: 'The brief names the file or symbol, or the answer sits in one place.',
    }),
    asks_for_change: noul('Does `brief` ask for code, files, or configuration to be created or modified?', {
      true: 'It asks to add, implement, fix, refactor, write, remove, rename, or configure something.',
      false: 'It asks to explain, find, list, review, compare, or decide, with nothing to be edited.',
    }),
  };
}

export function truncate(state) {
  return { ...state, brief: String(state.brief).slice(0, MAX_BRIEF_CHARS) };
}
