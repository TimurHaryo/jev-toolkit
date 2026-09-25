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
