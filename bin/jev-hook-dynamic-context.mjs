#!/usr/bin/env node
import { readStdinJson, writeHookOutput, EXIT } from '../src/hooks/io.mjs';
import { runDynamicContext } from '../src/adapters/dynamic-context/hook.mjs';

const input = await readStdinJson();
const { output, exitCode } = await runDynamicContext(input);
writeHookOutput(output);
process.exitCode = exitCode ?? EXIT.OK;
