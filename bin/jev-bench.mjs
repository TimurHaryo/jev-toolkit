#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { hostname, platform } from 'node:os';
import { loadConfig, toolkitRoot } from '../src/client/config.mjs';
import { resolveProvider } from '../src/bench/providers.mjs';
import { runBenchmark } from '../src/bench/runner.mjs';
import { assertTarget } from '../src/bench/target.mjs';

// The claude child is spawned detached (its own process group), so Ctrl-C does not reach it on its own.
let current = null;
function stopCurrent() {
  if (!current || current.exitCode !== null || current.signalCode !== null) return;
  try { if (!(current.pid > 0)) throw new Error('no pid'); process.kill(-current.pid, 'SIGTERM'); } catch { try { current.kill('SIGTERM'); } catch { /* gone */ } }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopCurrent(); process.exit(130); });

function sh(cmd, args, cwd) { try { return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return 'unknown'; } }

async function main() {
  let values;
  try {
    ({ values } = parseArgs({ options: { area: { type: 'string' }, arm: { type: 'string' }, target: { type: 'string' }, 'target-name': { type: 'string', default: 'websocket-inspector' }, 'run-id': { type: 'string' }, tasks: { type: 'string', default: 'all' }, reps: { type: 'string', default: '1' }, provider: { type: 'string' }, compile: { type: 'boolean', default: false }, 'yes-reset': { type: 'boolean', default: false } } }));
  } catch (e) { console.error(`usage error: ${e.message}`); return 1; }
  if (!values.area || !values.arm || !values.target || !values['run-id']) {
    console.error('usage: jev-bench --area <a> --arm <arm> --target <dir> --run-id <id> [--tasks all|id,id] [--reps n] [--provider name] [--target-name websocket-inspector] [--compile] --yes-reset');
    return 1;
  }
  const targetName = values['target-name'];
  // A typo here would otherwise surface only after the first reset of the target.
  if (!/^[\w.-]+$/.test(targetName) || targetName.startsWith('.') || !existsSync(join(toolkitRoot(), 'targets', targetName, 'arms'))) {
    console.error(`refused: unknown target ${targetName}`);
    return 3;
  }
  const config = loadConfig();
  if (config.configMissing) { console.error('refused: jev.config.json is missing'); return 3; }
  const targetDir = resolve(values.target);
  try { assertTarget({ targetDir, allowedRoots: config.allowedRoots }); } catch (e) { console.error(`refused: ${e.message}`); return 3; }
  if (!values['yes-reset']) { console.error(`This will run git reset --hard jev-baseline && git clean -fd in ${targetDir} before every task. Re-run with --yes-reset to confirm.`); return 1; }
  let provider;
  try { provider = resolveProvider(config, values.provider); } catch (e) { console.error(`refused: ${e.message}`); return 3; }
  try {
    const r = await runBenchmark({
      area: values.area, arm: values.arm, taskIds: values.tasks === 'all' ? 'all' : values.tasks.split(','), reps: Number(values.reps) || 1,
      runId: values['run-id'], targetDir, targetName, config, provider, env: process.env, resultsDir: join(toolkitRoot(), 'results'),
      claudeVersion: sh('claude', ['--version']), toolkitCommit: sh('git', ['rev-parse', '--short', 'HEAD'], toolkitRoot()),
      device: { label: hostname(), os: platform(), node: process.version }, yesReset: true, compile: values.compile, onChild: (c) => { current = c; c.once('close', () => { if (current === c) current = null; }); },
    });
    console.log(`written ${r.written.length} result file(s); failures ${r.failures.length}`);
    for (const f of r.failures) console.log(`  FAILED ${f.task} r${f.rep}: ${f.error}`);
    return r.failures.length ? 2 : 0;
  } catch (e) { console.error(`refused: ${e.message}`); return 3; }
}

process.exitCode = await main();
