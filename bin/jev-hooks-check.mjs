#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { loadConfig } from '../src/client/config.mjs';
import { resolveProvider } from '../src/bench/providers.mjs';
import { checkHooks } from '../src/bench/hooks-check.mjs';

async function main() {
  let values;
  try { ({ values } = parseArgs({ options: { target: { type: 'string' }, provider: { type: 'string' }, 'yes-reset': { type: 'boolean', default: false } } })); } catch (e) { console.error(`usage error: ${e.message}`); return 1; }
  if (!values.target) { console.error('usage: jev-hooks-check --target <dir> [--provider name] --yes-reset'); return 1; }
  if (!values['yes-reset']) { console.error('This resets the target to jev-baseline before and after the probes. Re-run with --yes-reset.'); return 1; }
  try {
    const config = loadConfig();
    if (config.configMissing) throw new Error('jev.config.json is missing');
    const { checks } = await checkHooks({ targetDir: resolve(values.target), config, provider: resolveProvider(config, values.provider), env: process.env, log: (m) => console.log(m) });
    for (const c of checks) console.log(c.ok ? `PASS ${c.name}` : `FAIL ${c.name}: ${c.detail}`);
    return checks.every((c) => c.ok) ? 0 : 2;
  } catch (e) { console.error(`refused: ${e.message}`); return 3; }
}

process.exitCode = await main();
