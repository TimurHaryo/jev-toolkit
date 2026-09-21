#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { route } from '../src/adapters/model-router/route.mjs';

async function readStdinText() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

async function main() {
  try {
    // Inside the try: an unknown flag is a usage error, not a stack trace.
    const { values } = parseArgs({ options: { brief: { type: 'string' } } });
    const brief = (values.brief ? await readFile(values.brief, 'utf8') : await readStdinText()).trim();
    if (!brief) {
      console.error('usage: jev-route [--brief <file>]  (or pipe the brief on stdin); brief is empty');
      return 1;
    }
    const r = await route(brief);
    console.log(JSON.stringify(r));
    return r.tier ? 0 : 3;
  } catch (e) {
    console.error(`route failed: ${e.message}`);
    return 3;
  }
}

process.exitCode = await main();
