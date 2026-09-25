#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, toolkitRoot } from '../src/client/config.mjs';
import { decide } from '../src/client/jev-client.mjs';
import { compareCase, summarize, formatReport } from '../src/bench/accuracy.mjs';
import { makeJudgeDecide } from '../src/bench/llm-judge.mjs';
import { resolveProvider, headlessEnv } from '../src/bench/providers.mjs';

const { values } = parseArgs({ options: { area: { type: 'string' }, mode: { type: 'string' }, judge: { type: 'string', default: 'jev' } } });
if (!values.area) {
  console.error('usage: jev-accuracy --area <area> [--mode live|record|replay] [--judge jev|llm]');
  process.exit(1);
}
if (values.mode && !['live', 'record', 'replay'].includes(values.mode)) {
  console.error('--mode must be live, record, or replay');
  process.exit(1);
}
if (!['jev', 'llm'].includes(values.judge)) {
  console.error('--judge must be jev or llm');
  process.exit(1);
}
const config = loadConfig({ env: { ...process.env, ...(values.mode ? { JEV_MODE: values.mode } : {}) } });
const cwd = config.allowedRoots[0] ?? toolkitRoot();
if (!config.allowedRoots.length) config.allowedRoots.push(toolkitRoot());

// The LLM judge always runs live against the configured provider, with the same scrubbed, isolated env as a benchmark run.
let decideImpl = decide;
let judgeModel = null;
if (values.judge === 'llm') {
  try {
    const provider = resolveProvider(config);
    const env = headlessEnv({ provider, config, env: process.env, runId: 'accuracy' });
    judgeModel = process.env.JEV_JUDGE_MODEL ?? provider.models.haiku;
    decideImpl = makeJudgeDecide({ model: judgeModel, env });
  } catch (e) {
    console.error(`refused: ${e.message}`);
    process.exit(3);
  }
}

const lines = (await readFile(join(toolkitRoot(), 'fixtures', values.area, 'cases.jsonl'), 'utf8')).trim().split('\n');
const rows = [];
const skipped = [];
for (const [index, line] of lines.entries()) {
  const c = JSON.parse(line);
  const r = await decideImpl(values.area, c.state, { cwd, config, sessionId: `accuracy-${values.area}` });
  if (!r.ok) { skipped.push({ index, reason: r.reason }); continue; }
  rows.push(...compareCase(c.expected, r.answers));
}
console.log(values.judge === 'llm' ? `judge: llm (${judgeModel})` : 'judge: jev');
console.log(`skipped ${skipped.length} of ${lines.length}`);
console.log(formatReport(values.area, summarize(rows), skipped));
if (lines.length && skipped.length === lines.length) process.exitCode = 2;
