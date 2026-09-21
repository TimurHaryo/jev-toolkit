#!/usr/bin/env node
import { loadConfig } from '../src/client/config.mjs';
import { postSystemOne } from '../src/client/http.mjs';
import { validateAnswers } from '../src/client/schema.mjs';
import { buildSmokeRequest, formatSmokeReport } from '../src/client/smoke.mjs';

const config = loadConfig();
if (!config.apiKey) {
  console.error('TYPESAFE_API_KEY is not set.');
  process.exit(2);
}
const req = buildSmokeRequest(config.model);
const started = Date.now();
let res;
try {
  res = await postSystemOne({ url: config.baseUrl, apiKey: config.apiKey, body: req, timeoutMs: Math.max(config.timeoutMs, 10000) });
} catch (e) {
  console.log(`JEV smoke: FAIL\n\nPASTE THIS BACK\n----------------\nerror: ${e.name}: ${e.message}\n----------------`);
  process.exit(2);
}
const report = formatSmokeReport({ ...res, validation: validateAnswers(req.questions, res.body), latencyMs: Date.now() - started });
console.log(report.text);
process.exit(report.ok ? 0 : 2);
