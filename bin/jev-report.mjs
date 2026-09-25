#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { loadConfig, toolkitRoot } from '../src/client/config.mjs';
import { readRun } from '../src/bench/results.mjs';
import { resolveProvider } from '../src/bench/providers.mjs';
import { readLabels, applyLabels, applyPricing, summarizeRun, renderReport, compareRuns } from '../src/bench/report.mjs';

/** The run's own provider (from its manifest), else the active one; null when neither is configured. */
function pricingFor(config, manifest) {
  for (const name of [manifest.provider, undefined]) {
    try { return resolveProvider(config, name).pricing; } catch { /* try the next */ }
  }
  console.error(`warning: no provider config for ${manifest.provider ?? '(unknown)'}; costs are reported as recorded`);
  return null;
}

async function main() {
  let values;
  try { ({ values } = parseArgs({ options: { 'run-id': { type: 'string' }, compare: { type: 'string' }, labels: { type: 'string' } } })); } catch (e) { console.error(`usage error: ${e.message}`); return 1; }
  if (!values['run-id']) { console.error('usage: jev-report --run-id <id> [--compare <id2>] [--labels <path>]'); return 1; }
  const resultsDir = join(toolkitRoot(), 'results');
  const config = loadConfig();
  const load = async (id) => {
    const run = await readRun(resultsDir, id);
    const pricing = pricingFor(config, run.manifest);
    const priced = pricing ? applyPricing(run.records, pricing, config.benchmark?.jevInputPricePerMTok ?? 0.042) : run.records;
    const labels = await readLabels(values.labels ?? join(toolkitRoot(), 'labels', `${id}.jsonl`));
    const { records, unmatched } = applyLabels(priced, labels);
    for (const l of unmatched) console.error(`warning: label did not match any record: ${JSON.stringify(l)}`);
    return { manifest: run.manifest, summary: summarizeRun(records) };
  };
  try {
    const a = await load(values['run-id']);
    const md = renderReport(a.manifest, a.summary);
    process.stdout.write(md);
    await writeFile(join(resultsDir, values['run-id'], 'report.md'), md);
    if (values.compare) {
      const b = await load(values.compare);
      const cmp = compareRuns(a, b);
      process.stdout.write(cmp);
      await writeFile(join(resultsDir, values['run-id'], `compare-${values.compare}.md`), cmp);
    }
    return 0;
  } catch (e) { console.error(`report failed: ${e.message}`); return 1; }
}

process.exitCode = await main();
