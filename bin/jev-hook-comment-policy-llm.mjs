#!/usr/bin/env node
import { readStdinJson, writeHookOutput, EXIT } from '../src/hooks/io.mjs';
import { runCommentPolicyLlm } from '../src/adapters/comment-policy/llm-hook.mjs';

const input = await readStdinJson();
const { output, exitCode } = await runCommentPolicyLlm(input);
writeHookOutput(output);
process.exitCode = exitCode ?? EXIT.OK;
