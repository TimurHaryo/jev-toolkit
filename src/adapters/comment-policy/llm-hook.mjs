import { runCommentPolicy } from './hook.mjs';
import { makeJudgeDecide } from '../../bench/llm-judge.mjs';

/** The comment-policy hook with an LLM judge in place of Jev; the benchmark's `llm` arm. */
export function runCommentPolicyLlm(input, opts = {}) {
  const env = opts.env ?? process.env;
  const model = opts.model ?? env.JEV_JUDGE_MODEL ?? env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? 'haiku';
  return runCommentPolicy(input, { ...opts, decideImpl: makeJudgeDecide({ model, spawnImpl: opts.spawnImpl, env }) });
}
