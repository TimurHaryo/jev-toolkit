#!/usr/bin/env node
import { readStdinJson, writeHookOutput, EXIT } from '../src/hooks/io.mjs';
import { runSubagentStart } from '../src/adapters/handback-check/start-hook.mjs';

const input = await readStdinJson();
const { output, exitCode } = await runSubagentStart(input);
writeHookOutput(output);
process.exitCode = exitCode ?? EXIT.OK;
