import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { DEFAULTS, loadConfig, toolkitRoot } from '../src/client/config.mjs';

test('toolkitRoot points at the directory holding package.json', async () => {
  const root = toolkitRoot();
  assert.ok(isAbsolute(root));
  const { readFile } = await import('node:fs/promises');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'jev-toolkit');
});

test('loadConfig merges file over DEFAULTS and resolves dirs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jevcfg-'));
  const path = join(dir, 'jev.config.json');
  await writeFile(path, JSON.stringify({ timeoutMs: 1234, allowedRoots: ['/tmp/x'], logDir: 'mylogs' }));
  const cfg = loadConfig({ env: { TYPESAFE_API_KEY: 'k' }, configPath: path });
  assert.equal(cfg.timeoutMs, 1234);
  assert.equal(cfg.model, DEFAULTS.model);
  assert.deepEqual(cfg.allowedRoots, ['/tmp/x']);
  assert.equal(cfg.logDir, join(dir, 'mylogs'));
  assert.equal(cfg.recordingsDir, join(toolkitRoot(), 'fixtures', 'recordings'));
  assert.equal(cfg.apiKey, 'k');
  assert.equal(cfg.disabled, false);
  assert.equal(cfg.configMissing, false);
});

test('loadConfig with a missing file falls back to DEFAULTS and flags it', () => {
  const cfg = loadConfig({ env: {}, configPath: '/nonexistent/jev.config.json' });
  assert.equal(cfg.configMissing, true);
  assert.deepEqual(cfg.allowedRoots, []);
  assert.equal(cfg.apiKey, undefined);
});

test('env overrides: JEV_MODE, JEV_LOG_DIR, JEV_DISABLE, JEV_CONFIG', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jevcfg-'));
  const path = join(dir, 'c.json');
  await writeFile(path, JSON.stringify({ mode: 'live' }));
  const cfg = loadConfig({ env: { JEV_CONFIG: path, JEV_MODE: 'replay', JEV_LOG_DIR: '/tmp/jevlogs', JEV_DISABLE: '1' } });
  assert.equal(cfg.mode, 'replay');
  assert.equal(cfg.logDir, '/tmp/jevlogs');
  assert.equal(cfg.disabled, true);
});
