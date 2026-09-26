#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, toolkitRoot } from '../src/client/config.mjs';
import { decide } from '../src/client/jev-client.mjs';
import { compareCase, summarize, formatReport, decisionCost, formatCostBlock, dumpLine } from '../src/bench/accuracy.mjs';
import { makeJudgeDecide } from '../src/bench/llm-judge.mjs';
import { makeApiJudgeDecide } from '../src/bench/api-judge.mjs';
import { resolveProvider, headlessEnv } from '../src/bench/providers.mjs';

const JUDGES = ['jev', 'llm', 'api'];
const { values } = parseArgs({ options: { area: { type: 'string' }, mode: { type: 'string' }, judge: { type: 'string', default: 'jev' }, dump: { type: 'string' } } });
if (!values.area) {
  console.error('usage: jev-accuracy --area <area> [--mode live|record|replay] [--judge jev|llm|api] [--dump <path>]');
  process.exit(1);
}
if (values.mode && !['live', 'record', 'replay'].includes(values.mode)) {
  console.error('--mode must be live, record, or replay');
  process.exit(1);
}
if (!JUDGES.includes(values.judge)) {
  console.error('--judge must be jev, llm, or api');
  process.exit(1);
}
const config = loadConfig({ env: { ...process.env, ...(values.mode ? { JEV_MODE: values.mode } : {}) } });
const cwd = config.allowedRoots[0] ?? toolkitRoot();
if (!config.allowedRoots.length) config.allowedRoots.push(toolkitRoot());

// The LLM judges always run live against the configured provider. The CLI judge gets the same scrubbed,
// isolated env as a benchmark run; the API judge only reads the provider's token variable.
let decideImpl = decide;
let judgeModel = null;
let provider = null;
if (values.judge !== 'jev') {
  try {
    provider = resolveProvider(config);
    judgeModel = process.env.JEV_JUDGE_MODEL ?? provider.models.haiku;
    decideImpl = values.judge === 'llm'
      ? makeJudgeDecide({ model: judgeModel, env: headlessEnv({ provider, config, env: process.env, runId: 'accuracy' }) })
      : makeApiJudgeDecide({ provider, env: process.env, model: judgeModel });
  } catch (e) {
    console.error(`refused: ${e.message}`);
    process.exit(3);
  }
}

const area = await import(`../src/questions/${values.area}.mjs`);
const lines = (await readFile(join(toolkitRoot(), 'fixtures', values.area, 'cases.jsonl'), 'utf8')).trim().split('\n');
const rows = [];
const skipped = [];
const costs = [];
const dump = [];
for (const [index, line] of lines.entries()) {
  const c = JSON.parse(line);
  const r = await decideImpl(values.area, c.state, { cwd, config, sessionId: `accuracy-${values.area}` });
  const caseRows = r.ok ? compareCase(c.expected, r.answers) : [];
  dump.push(dumpLine({ index, result: r, rows: caseRows }));
  const cost = decisionCost({
    judge: values.judge, result: r, state: c.state, questions: values.judge === 'jev' ? area.buildQuestions(c.state) : undefined,
    model: judgeModel, pricing: provider?.pricing, jevPricePerMTok: config.benchmark?.jevInputPricePerMTok ?? 0.042,
  });
  if (cost) costs.push(cost);
  if (!r.ok) { skipped.push({ index, reason: r.reason }); continue; }
  rows.push(...caseRows);
}
console.log(values.judge === 'jev' ? 'judge: jev' : `judge: ${values.judge} (${judgeModel})`);
console.log(`skipped ${skipped.length} of ${lines.length}`);
console.log(formatReport(values.area, summarize(rows), skipped));
console.log('');
console.log(formatCostBlock(costs, { judge: values.judge, mode: config.mode }));
if (values.dump) {
  const path = resolve(values.dump);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, dump.map((d) => JSON.stringify(d)).join('\n') + (dump.length ? '\n' : ''));
}
if (lines.length && skipped.length === lines.length) process.exitCode = 2;
