import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { toolkitRoot } from '../client/config.mjs';

export const TIERS = Object.freeze(['opus', 'sonnet', 'haiku', 'subagent']);
const AUTH_VARS = Object.freeze({ bearer: 'ANTHROPIC_AUTH_TOKEN', 'x-api-key': 'ANTHROPIC_API_KEY' });

export function resolveProvider(config, name) {
  const key = name ?? config?.activeProvider;
  const p = config?.providers?.[key];
  if (!p) throw new Error(`provider ${key ?? '(none)'} not configured`);
  if (typeof p.authTokenEnv !== 'string' || !p.authTokenEnv) throw new Error(`provider ${key} is missing authTokenEnv`);
  for (const tier of TIERS) if (!p.models?.[tier]) throw new Error(`provider ${key} is missing models.${tier}`);
  const authHeader = p.authHeader ?? 'bearer';
  if (!AUTH_VARS[authHeader]) throw new Error(`provider ${key} has unknown authHeader ${authHeader}`);
  return { name: key, baseUrl: p.baseUrl ?? null, authTokenEnv: p.authTokenEnv, authHeader, models: p.models, pricing: p.pricing ?? {} };
}

const authVarOf = (provider) => AUTH_VARS[provider.authHeader ?? 'bearer'] ?? AUTH_VARS.bearer;

/** Environment for one headless run. The token is read from the env var the provider names; it is never stored. */
export function armEnv({ provider, env, runId, logDir, subagentTier }) {
  const tier = subagentTier ?? 'subagent';
  if (!TIERS.includes(tier)) throw new Error(`unknown subagent tier ${tier}`);
  const token = env[provider.authTokenEnv];
  if (!token) throw new Error(`${provider.authTokenEnv} is not set`);
  return {
    ...(provider.baseUrl ? { ANTHROPIC_BASE_URL: provider.baseUrl } : {}),
    [authVarOf(provider)]: token,
    ANTHROPIC_DEFAULT_OPUS_MODEL: provider.models.opus,
    ANTHROPIC_DEFAULT_SONNET_MODEL: provider.models.sonnet,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: provider.models.haiku,
    CLAUDE_CODE_SUBAGENT_MODEL: provider.models[tier],
    JEV_MODE: 'live',
    JEV_RUN_ID: runId,
    JEV_LOG_DIR: logDir,
  };
}

const SESSION_MARKERS = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT'];

/**
 * A copy of env without anything that could leak into a headless run from the caller: the auth variable
 * this provider does not use, other providers' keys, a stray base URL for a native provider, the parent
 * Claude Code session markers, and git's repository overrides.
 */
export function scrubEnv(env, provider, config) {
  const out = { ...env };
  const used = authVarOf(provider);
  for (const v of Object.values(AUTH_VARS)) if (v !== used) delete out[v];
  for (const [name, p] of Object.entries(config?.providers ?? {})) {
    if (name === provider.name || !p?.authTokenEnv || p.authTokenEnv === provider.authTokenEnv || p.authTokenEnv === used) continue;
    delete out[p.authTokenEnv];
  }
  if (!provider.baseUrl) delete out.ANTHROPIC_BASE_URL;
  for (const k of SESSION_MARKERS) delete out[k];
  for (const k of Object.keys(out)) if (k.startsWith('GIT_')) delete out[k];
  return out;
}

export const isolatedConfigDir = () => join(toolkitRoot(), '.claude-config');

/**
 * The full environment for a headless claude session: caller env, overrides, and the arm's variables,
 * scrubbed; with an isolated CLAUDE_CONFIG_DIR unless `benchmark.isolateClaudeConfig` is false.
 */
export function headlessEnv({ provider, config, env, runId, subagentTier, baseEnv = process.env }) {
  const out = scrubEnv({ ...baseEnv, ...env, ...armEnv({ provider, env, runId, logDir: config.logDir, subagentTier }) }, provider, config);
  if (config.benchmark?.isolateClaudeConfig ?? true) {
    const dir = isolatedConfigDir();
    mkdirSync(dir, { recursive: true });
    out.CLAUDE_CONFIG_DIR = dir;
  }
  return out;
}
