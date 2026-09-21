#!/usr/bin/env node
import { readStdinJson, writeHookOutput, EXIT } from '../src/hooks/io.mjs';
import { runHandbackCheck } from '../src/adapters/handback-check/hook.mjs';

const input = await readStdinJson();
const { output, exitCode } = await runHandbackCheck(input);
writeHookOutput(output);
process.exitCode = exitCode ?? EXIT.OK;
