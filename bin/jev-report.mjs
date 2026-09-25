#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { toolkitRoot } from '../src/client/config.mjs';
import { readRun } from '../src/bench/results.mjs';
import { readLabels, applyLabels, summarizeRun, renderReport, compareRuns } from '../src/bench/report.mjs';

async function main() {
  let values;
  try { ({ values } = parseArgs({ options: { 'run-id': { type: 'string' }, compare: { type: 'string' }, labels: { type: 'string' } } })); } catch (e) { console.error(`usage error: ${e.message}`); return 1; }
  if (!values['run-id']) { console.error('usage: jev-report --run-id <id> [--compare <id2>] [--labels <path>]'); return 1; }
  const resultsDir = join(toolkitRoot(), 'results');
  const load = async (id) => {
    const run = await readRun(resultsDir, id);
    const labels = await readLabels(values.labels ?? join(toolkitRoot(), 'labels', `${id}.jsonl`));
    return { manifest: run.manifest, summary: summarizeRun(applyLabels(run.records, labels)) };
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
