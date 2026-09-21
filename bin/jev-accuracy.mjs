#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, toolkitRoot } from '../src/client/config.mjs';
import { decide } from '../src/client/jev-client.mjs';
import { compareCase, summarize, formatReport } from '../src/bench/accuracy.mjs';

const { values } = parseArgs({ options: { area: { type: 'string' }, mode: { type: 'string' } } });
if (!values.area) {
  console.error('usage: jev-accuracy --area <area> [--mode live|record|replay]');
  process.exit(1);
}
const config = loadConfig({ env: { ...process.env, ...(values.mode ? { JEV_MODE: values.mode } : {}) } });
const cwd = config.allowedRoots[0] ?? toolkitRoot();
if (!config.allowedRoots.length) config.allowedRoots.push(toolkitRoot());

const lines = (await readFile(join(toolkitRoot(), 'fixtures', values.area, 'cases.jsonl'), 'utf8')).trim().split('\n');
const rows = [];
const skipped = [];
for (const [index, line] of lines.entries()) {
  const c = JSON.parse(line);
  const r = await decide(values.area, c.state, { cwd, config, sessionId: `accuracy-${values.area}` });
  if (!r.ok) { skipped.push({ index, reason: r.reason }); continue; }
  rows.push(...compareCase(c.expected, r.answers));
}
console.log(formatReport(values.area, summarize(rows), skipped));
