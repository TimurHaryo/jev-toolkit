#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { loadConfig, toolkitRoot } from '../src/client/config.mjs';
import { isAllowedRoot } from '../src/client/guard.mjs';
import { installArm } from '../src/targets/install.mjs';

async function isDirectory(path) {
  try { return (await stat(path)).isDirectory(); } catch { return false; }
}

async function main() {
  try {
    // Inside the try: an unknown flag is a usage error, not a stack trace.
    const { values } = parseArgs({ options: { target: { type: 'string' }, arm: { type: 'string' }, 'target-name': { type: 'string', default: 'websocket-inspector' } } });
    if (!values.target || !values.arm) {
      console.error('usage: jev-install --target <dir> --arm <name> [--target-name websocket-inspector]');
      return 1;
    }
    const config = loadConfig();
    const targetDir = resolve(values.target);
    if (config.configMissing || !isAllowedRoot(targetDir, config.allowedRoots)) {
      console.error(`refused: ${targetDir} is not under allowedRoots in jev.config.json (or the config is missing)`);
      return 3;
    }
    if (!(await isDirectory(targetDir))) {
      console.error(`refused: ${targetDir} does not exist`);
      return 3;
    }
    const base = join(toolkitRoot(), 'targets', values['target-name']);
    const { written, removed } = await installArm({ targetDir, armFile: join(base, 'arms', `${values.arm}.json`), rulesDir: join(base, 'rules'), toolkitPath: toolkitRoot() });
    for (const p of written) console.log(`wrote   ${p}`);
    for (const p of removed) console.log(`removed ${p}`);
    return 0;
  } catch (e) {
    console.error(`install failed: ${e.message}`);
    return 4;
  }
}

process.exitCode = await main();
