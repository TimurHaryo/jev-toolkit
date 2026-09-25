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

const items = (events, role, kind) => events.flatMap((e, index) => (e.type === role && Array.isArray(e.message?.content) ? e.message.content.filter((c) => c?.type === kind).map((c) => ({ index, ...c })) : []));

export function toolUses(events) {
  return items(events, 'assistant', 'tool_use').map(({ index, name, input, id }) => ({ index, name, input, id }));
}

export function toolResults(events) {
  return items(events, 'user', 'tool_result').map(({ index, tool_use_id }) => ({ index, tool_use_id }));
}

/** One headless Claude Code session. Never throws; the caller inspects code/timedOut. */
export function runClaude({ cwd, prompt, model, maxTurns, allowedTools, env, spawnImpl = nodeSpawn, timeoutMs = 20 * 60 * 1000, rawOutPath }) {
  return new Promise((resolve) => {
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--model', model, '--max-turns', String(maxTurns), '--permission-mode', 'acceptEdits', '--allowedTools', allowedTools];
    const child = spawnImpl('claude', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let timedOut = false; let done = false;
    const finish = async (code) => {
      if (done) return; done = true; clearTimeout(timer);
      if (rawOutPath) { try { await mkdir(dirname(rawOutPath), { recursive: true }); await writeFile(rawOutPath, stdout); } catch { /* best-effort */ } }
      resolve({ code, stdout, stderr, timedOut });
    };
    const timer = setTimeout(() => { timedOut = true; try { child.kill(); } catch { /* already gone */ } finish(null); }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });
    child.on('error', (e) => { stderr += e.message; finish(null); });
    child.on('close', (code) => finish(code));
  });
}
