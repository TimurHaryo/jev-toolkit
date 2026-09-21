#!/usr/bin/env node
import { readStdinJson, writeHookOutput, EXIT } from '../src/hooks/io.mjs';
import { runCommentPolicy } from '../src/adapters/comment-policy/hook.mjs';

const input = await readStdinJson();
const { output, exitCode } = await runCommentPolicy(input);
writeHookOutput(output);
process.exitCode = exitCode ?? EXIT.OK;
