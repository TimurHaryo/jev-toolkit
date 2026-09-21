#!/usr/bin/env node
import { readStdinJson, writeHookOutput, EXIT } from '../src/hooks/io.mjs';
import { runHandbackPost } from '../src/adapters/handback-check/hook.mjs';

const input = await readStdinJson();
const { output, exitCode } = await runHandbackPost(input);
writeHookOutput(output);
process.exitCode = exitCode ?? EXIT.OK;
