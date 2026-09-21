#!/usr/bin/env node
import { readStdinJson, writeHookOutput, EXIT } from '../src/hooks/io.mjs';
import { runHandbackPre } from '../src/adapters/handback-check/pre-hook.mjs';

const input = await readStdinJson();
const { output, exitCode } = await runHandbackPre(input);
writeHookOutput(output);
process.exitCode = exitCode ?? EXIT.OK;
