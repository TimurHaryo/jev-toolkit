import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadRules } from './rules.mjs';
import { renderClaudeMd } from './claude-md.mjs';

const MARKER = '.jev-managed';
const FOLDERS = { jev: 'jev-rules', native: 'rules' };

export function renderHooks(hooks, toolkitPath) {
  const out = {};
  for (const [event, entries] of Object.entries(hooks)) {
    out[event] = entries.map((e) => {
      const hook = { type: 'command', command: `node "${toolkitPath}/bin/${e.bin}"`, timeout: e.timeout };
      if (e.statusMessage) hook.statusMessage = e.statusMessage;
      return e.matcher ? { matcher: e.matcher, hooks: [hook] } : { hooks: [hook] };
    });
  }
  return out;
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function readJsonOr(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}

function nativeFrontmatter(rule) {
  return `---\npaths:\n${rule.paths.map((p) => `  - "${p}"`).join('\n')}\n---\n${rule.body}`;
}

async function removeManaged(dir, removed) {
  if (await exists(join(dir, MARKER))) { await rm(dir, { recursive: true, force: true }); removed.push(dir); }
}

async function writeRules(claudeDir, mode, rules, written, removed) {
  for (const [kind, folder] of Object.entries(FOLDERS)) {
    if (kind !== mode) await removeManaged(join(claudeDir, folder), removed);
  }
  if (mode === 'none') return;
  const dir = join(claudeDir, FOLDERS[mode]);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, MARKER), 'written by jev-install; safe to delete\n');
  for (const rule of rules.filter((r) => !r.always)) {
    if (mode === 'native' && rule.paths.length === 0) continue;
    const text = mode === 'native' ? nativeFrontmatter(rule) : await readFile(rule.sourcePath, 'utf8');
    const path = join(dir, rule.file);
    await writeFile(path, text);
    written.push(path);
  }
}

/** Installs one benchmark arm into a target project. JEV owns CLAUDE.md, settings.hooks, and its rules folder. */
export async function installArm({ targetDir, armFile, rulesDir, toolkitPath }) {
  const arm = JSON.parse(await readFile(armFile, 'utf8'));
  const rules = (await loadRules(rulesDir)).map((r) => ({ ...r, sourcePath: join(rulesDir, r.file) }));
  const written = [];
  const removed = [];
  const claudeDir = join(targetDir, '.claude');
  await mkdir(claudeDir, { recursive: true });

  const claudePath = join(targetDir, 'CLAUDE.md');
  await writeFile(claudePath, renderClaudeMd(arm.claudeMd, rules));
  written.push(claudePath);

  const settingsPath = join(claudeDir, 'settings.json');
  const existing = await readJsonOr(settingsPath, {});
  await writeFile(settingsPath, `${JSON.stringify({ ...existing, hooks: renderHooks(arm.hooks, toolkitPath) }, null, 2)}\n`);
  written.push(settingsPath);

  await writeRules(claudeDir, arm.rules, rules, written, removed);
  return { written, removed };
}
