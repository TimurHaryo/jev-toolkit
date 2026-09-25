export function resolveProvider(config, name) {
  const key = name ?? config?.activeProvider;
  const p = config?.providers?.[key];
  if (!p) throw new Error(`provider ${key ?? '(none)'} not configured`);
  return { name: key, baseUrl: p.baseUrl ?? null, authTokenEnv: p.authTokenEnv, models: p.models, pricing: p.pricing ?? {} };
}

/** Environment for one headless run. The token is read from the env var the provider names; it is never stored. */
export function armEnv({ provider, env, runId, logDir, subagentTier }) {
  const token = env[provider.authTokenEnv];
  if (!token) throw new Error(`${provider.authTokenEnv} is not set`);
  const out = {
    ...(provider.baseUrl ? { ANTHROPIC_BASE_URL: provider.baseUrl } : {}),
    ANTHROPIC_AUTH_TOKEN: token,
    ANTHROPIC_DEFAULT_OPUS_MODEL: provider.models.opus,
    ANTHROPIC_DEFAULT_SONNET_MODEL: provider.models.sonnet,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: provider.models.haiku,
    CLAUDE_CODE_SUBAGENT_MODEL: provider.models[subagentTier ?? 'subagent'],
    JEV_MODE: 'live',
    JEV_RUN_ID: runId,
    JEV_LOG_DIR: logDir,
  };
  return out;
}
