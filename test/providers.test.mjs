import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveProvider, armEnv } from '../src/bench/providers.mjs';
import { toolkitRoot } from '../src/client/config.mjs';

const config = { activeProvider: 'deepseek', providers: {
  deepseek: { baseUrl: 'https://api.deepseek.com/anthropic', authTokenEnv: 'DEEPSEEK_API_KEY', models: { opus: 'r1', sonnet: 'v3', haiku: 'v3', subagent: 'v3' }, pricing: {} },
  anthropic: { baseUrl: null, authTokenEnv: 'ANTHROPIC_API_KEY', models: { opus: 'o', sonnet: 's', haiku: 'h', subagent: 's' }, pricing: {} },
} };

test('resolveProvider picks the active provider by default and by name', () => {
  assert.equal(resolveProvider(config).name, 'deepseek');
  assert.equal(resolveProvider(config, 'anthropic').name, 'anthropic');
  assert.throws(() => resolveProvider(config, 'nope'), /not configured/);
  assert.throws(() => resolveProvider({}), /not configured/);
});

test('armEnv builds the full variable set and reads the token from the named env var', () => {
  const env = armEnv({ provider: resolveProvider(config), env: { DEEPSEEK_API_KEY: 'tok' }, runId: 'r1', logDir: '/logs' });
  assert.deepEqual(env, {
    ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic', ANTHROPIC_AUTH_TOKEN: 'tok',
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'r1', ANTHROPIC_DEFAULT_SONNET_MODEL: 'v3', ANTHROPIC_DEFAULT_HAIKU_MODEL: 'v3',
    CLAUDE_CODE_SUBAGENT_MODEL: 'v3', JEV_MODE: 'live', JEV_RUN_ID: 'r1', JEV_LOG_DIR: '/logs',
  });
});

test('armEnv omits the base URL for native Anthropic, honours subagentTier, and refuses a missing token', () => {
  const env = armEnv({ provider: resolveProvider(config, 'anthropic'), env: { ANTHROPIC_API_KEY: 'k' }, runId: 'r', logDir: '/l', subagentTier: 'haiku' });
  assert.equal('ANTHROPIC_BASE_URL' in env, false);
  assert.equal(env.CLAUDE_CODE_SUBAGENT_MODEL, 'h');
  assert.throws(() => armEnv({ provider: resolveProvider(config), env: {}, runId: 'r', logDir: '/l' }), /DEEPSEEK_API_KEY is not set/);
});

test('the example config parses and carries the new sections', async () => {
  const ex = JSON.parse(await readFile(join(toolkitRoot(), 'jev.config.example.json'), 'utf8'));
  assert.equal(ex.activeProvider, 'deepseek');
  assert.ok(ex.providers.deepseek.models.subagent);
  assert.equal(typeof ex.benchmark.maxTurns, 'number');
  assert.equal(typeof ex.benchmark.jevInputPricePerMTok, 'number');
});

import { scrubEnv } from '../src/bench/providers.mjs';

const keyed = { activeProvider: 'deepseek', providers: {
  deepseek: { ...config.providers.deepseek, authHeader: 'bearer' },
  anthropic: { ...config.providers.anthropic, authHeader: 'x-api-key' },
} };

test('an x-api-key provider sets ANTHROPIC_API_KEY only; a bearer provider sets ANTHROPIC_AUTH_TOKEN only', () => {
  const native = resolveProvider(keyed, 'anthropic');
  assert.equal(native.authHeader, 'x-api-key');
  const a = armEnv({ provider: native, env: { ANTHROPIC_API_KEY: 'k' }, runId: 'r', logDir: '/l' });
  assert.equal(a.ANTHROPIC_API_KEY, 'k');
  assert.equal('ANTHROPIC_AUTH_TOKEN' in a, false);
  const ds = resolveProvider(keyed, 'deepseek');
  assert.equal(ds.authHeader, 'bearer');
  const b = armEnv({ provider: ds, env: { DEEPSEEK_API_KEY: 'd' }, runId: 'r', logDir: '/l' });
  assert.equal(b.ANTHROPIC_AUTH_TOKEN, 'd');
  assert.equal('ANTHROPIC_API_KEY' in b, false);
  assert.equal(resolveProvider(config).authHeader, 'bearer');
});

test('scrubEnv drops the other provider key, the unused auth variable, the parent session markers, and GIT_ variables', () => {
  const ds = resolveProvider(keyed, 'deepseek');
  const input = { PATH: '/bin', DEEPSEEK_API_KEY: 'd', ANTHROPIC_API_KEY: 'leak', ANTHROPIC_AUTH_TOKEN: 'd', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', GIT_DIR: '/x/.git', GIT_INDEX_FILE: '/x/i', ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic' };
  const out = scrubEnv(input, ds, keyed);
  assert.deepEqual(out, { PATH: '/bin', DEEPSEEK_API_KEY: 'd', ANTHROPIC_AUTH_TOKEN: 'd', ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic' });
  assert.equal(input.CLAUDECODE, '1');
  const native = resolveProvider(keyed, 'anthropic');
  const n = scrubEnv({ ANTHROPIC_API_KEY: 'k', ANTHROPIC_AUTH_TOKEN: 'stale', DEEPSEEK_API_KEY: 'd', ANTHROPIC_BASE_URL: 'https://leak' }, native, keyed);
  assert.deepEqual(n, { ANTHROPIC_API_KEY: 'k' });
});

test('resolveProvider and armEnv refuse incomplete providers and unknown tiers', () => {
  const broken = { providers: { p: { baseUrl: null, authTokenEnv: 'K', models: { opus: 'o', sonnet: 's', haiku: 'h' } }, q: { baseUrl: null, authTokenEnv: '', models: { opus: 'o', sonnet: 's', haiku: 'h', subagent: 's' } } } };
  assert.throws(() => resolveProvider(broken, 'p'), /provider p is missing models\.subagent/);
  assert.throws(() => resolveProvider(broken, 'q'), /provider q is missing authTokenEnv/);
  assert.throws(() => armEnv({ provider: resolveProvider(config), env: { DEEPSEEK_API_KEY: 't' }, runId: 'r', logDir: '/l', subagentTier: 'giant' }), /unknown subagent tier giant/);
});

test('the example config names an auth header per provider and turns config isolation on', async () => {
  const ex = JSON.parse(await readFile(join(toolkitRoot(), 'jev.config.example.json'), 'utf8'));
  assert.equal(ex.providers.deepseek.authHeader, 'bearer');
  assert.equal(ex.providers.anthropic.authHeader, 'x-api-key');
  assert.equal(ex.benchmark.isolateClaudeConfig, true);
});
