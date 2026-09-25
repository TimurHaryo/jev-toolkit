import { spawn as nodeSpawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function parseStream(text) {
  const events = [];
  for (const line of String(text ?? '').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try { events.push(JSON.parse(t)); } catch { /* skip non-JSON lines */ }
  }
  const result = [...events].reverse().find((e) => e.type === 'result') ?? null;
  return { result, events };
}

const usageOf = (u) => ({
  input_tokens: u?.input_tokens ?? u?.inputTokens ?? 0,
  output_tokens: u?.output_tokens ?? u?.outputTokens ?? 0,
  cache_creation_input_tokens: u?.cache_creation_input_tokens ?? u?.cacheCreationInputTokens ?? 0,
  cache_read_input_tokens: u?.cache_read_input_tokens ?? u?.cacheReadInputTokens ?? 0,
});

export function extractResult(result) {
  if (!result) return { subtype: null, session_id: null, num_turns: 0, duration_ms: 0, usage: usageOf(null), per_model: {}, total_cost_usd_reported: null, result_text: '' };
  const per_model = Object.fromEntries(Object.entries(result.modelUsage ?? {}).map(([m, u]) => [m, usageOf(u)]));
  return {
    subtype: result.subtype ?? null,
    session_id: result.session_id ?? null,
    num_turns: result.num_turns ?? 0,
    duration_ms: result.duration_ms ?? 0,
    usage: usageOf(result.usage),
    per_model,
    total_cost_usd_reported: typeof result.total_cost_usd === 'number' ? result.total_cost_usd : null,
    result_text: typeof result.result === 'string' ? result.result : '',
  };
}

// Events produced inside a subagent carry the parent's Agent tool_use id; they are not the orchestrator's.
const isNested = (e) => e.parent_tool_use_id !== undefined && e.parent_tool_use_id !== null;

const items = (events, role, kind, topLevel) => events.flatMap((e, index) => (e.type === role && !(topLevel && isNested(e)) && Array.isArray(e.message?.content) ? e.message.content.filter((c) => c?.type === kind).map((c) => ({ index, ...c })) : []));

export function toolUses(events, { topLevel = true } = {}) {
  return items(events, 'assistant', 'tool_use', topLevel).map(({ index, name, input, id }) => ({ index, name, input, id }));
}

export function toolResults(events, { topLevel = true } = {}) {
  return items(events, 'user', 'tool_result', topLevel).map(({ index, tool_use_id }) => ({ index, tool_use_id }));
}

/** Kills the child's whole process group (it is spawned detached), falling back to the child alone. */
function killGroup(child, signal) {
  try {
    // A missing or zero pid would make -pid address our own group; never signal that.
    if (!(child.pid > 0)) throw new Error('no pid');
    process.kill(-child.pid, signal);
  } catch {
    try { child.kill(signal); } catch { /* gone */ }
  }
}

/**
 * One headless Claude Code session. Never throws or rejects; the caller inspects code/timedOut.
 * On timeout: SIGTERM to the process group, SIGKILL after graceMs, and resolve on close or graceMs
 * after the SIGKILL, so a reset of the target never races a still-running session.
 */
export function runClaude({ cwd, prompt, model, maxTurns, allowedTools, env, spawnImpl = nodeSpawn, killImpl = killGroup, timeoutMs = 20 * 60 * 1000, graceMs = 5000, rawOutPath }) {
  return new Promise((resolve) => {
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--model', model, '--max-turns', String(maxTurns), '--permission-mode', 'acceptEdits', '--allowedTools', allowedTools];
    let child;
    try {
      child = spawnImpl('claude', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    } catch (e) {
      resolve({ code: null, stdout: '', stderr: e.message, timedOut: false });
      return;
    }
    let stdout = ''; let stderr = ''; let timedOut = false; let done = false;
    const timers = [];
    const finish = async (code) => {
      if (done) return; done = true; for (const t of timers) clearTimeout(t);
      if (rawOutPath) { try { await mkdir(dirname(rawOutPath), { recursive: true }); await writeFile(rawOutPath, stdout); } catch { /* best-effort */ } }
      resolve({ code, stdout, stderr, timedOut });
    };
    const later = (ms, fn) => { timers.push(setTimeout(fn, ms)); };
    later(timeoutMs, () => {
      timedOut = true;
      killImpl(child, 'SIGTERM');
      later(graceMs, () => {
        killImpl(child, 'SIGKILL');
        later(graceMs, () => finish(null));
      });
    });
    child.stdout.setEncoding?.('utf8');
    child.stderr?.setEncoding?.('utf8');
    child.stdout.on('data', (d) => { stdout += String(d); });
    child.stderr?.on('data', (d) => { stderr += String(d); });
    child.on('error', (e) => { stderr += e.message; finish(null); });
    child.on('close', (code) => finish(code));
  });
}
