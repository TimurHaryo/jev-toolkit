import { mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export function buildManifest({ runId, provider, config, claudeVersion, toolkitCommit, device, questionVersions }) {
  let host = null;
  try { host = provider.baseUrl ? new URL(provider.baseUrl).host : 'api.anthropic.com'; } catch { host = null; }
  return {
    run_id: runId, date: new Date().toISOString(), device, provider: provider.name, base_url_host: host,
    models: provider.models, jev_model: config.model, question_versions: questionVersions ?? {},
    claude_code_version: claudeVersion, toolkit_commit: toolkitCommit,
  };
}

export async function writeResult(resultsDir, record) {
  const dir = join(resultsDir, record.run_id, record.area, record.arm);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${record.task}-r${record.rep}.json`);
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`);
  return path;
}

export async function writeManifest(resultsDir, manifest) {
  await mkdir(join(resultsDir, manifest.run_id), { recursive: true });
  await writeFile(join(resultsDir, manifest.run_id, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p)));
    else if (name.endsWith('.json') && name !== 'manifest.json') out.push(p);
  }
  return out;
}

export async function readRun(resultsDir, runId) {
  const base = join(resultsDir, runId);
  const manifest = JSON.parse(await readFile(join(base, 'manifest.json'), 'utf8'));
  const records = [];
  for (const p of await walk(base)) records.push(JSON.parse(await readFile(p, 'utf8')));
  return { manifest, records };
}
