import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULTS = Object.freeze({
  mode: 'live',
  model: 'jev-1.13.0',
  baseUrl: 'https://api.typesafe.ai/v1/systemone',
  timeoutMs: 3000,
  maxStateTokens: 24000,
  contextBudgetTokens: 6000,
  logDir: 'logs',
  allowedRoots: [],
});

const MODES = new Set(['live', 'record', 'replay']);

/** Absolute path of the directory that holds package.json. */
export function toolkitRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

const INVALID = Symbol('invalid');

function readJsonIfPresent(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return INVALID;
  }
}

function resolveDir(base, value) {
  return isAbsolute(value) ? value : join(base, value);
}

/**
 * Loads jev.config.json (device-local) over DEFAULTS, then applies env overrides.
 * Never throws for a missing or malformed config file: returns DEFAULTS with configMissing = true so hooks fail open.
 */
export function loadConfig({ env = process.env, configPath } = {}) {
  const path = configPath ?? env.JEV_CONFIG ?? join(toolkitRoot(), 'jev.config.json');
  const fromFile = readJsonIfPresent(path);
  const usable = fromFile !== null && fromFile !== INVALID;
  const base = { ...DEFAULTS, ...(usable ? fromFile : {}) };
  const configDir = usable ? dirname(path) : toolkitRoot();
  const mode = MODES.has(env.JEV_MODE) ? env.JEV_MODE : base.mode;
  return {
    ...base,
    mode,
    logDir: resolveDir(configDir, env.JEV_LOG_DIR ?? base.logDir),
    recordingsDir: join(toolkitRoot(), 'fixtures', 'recordings'),
    allowedRoots: Array.isArray(base.allowedRoots) ? [...base.allowedRoots] : [],
    apiKey: env.TYPESAFE_API_KEY,
    disabled: env.JEV_DISABLE === '1',
    configMissing: fromFile === null || fromFile === INVALID,
    configInvalid: fromFile === INVALID,
  };
}
