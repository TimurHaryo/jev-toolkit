import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { toolkitRoot } from '../client/config.mjs';
import { installArm, verifyInstall } from '../targets/install.mjs';
import { loadRules } from '../targets/rules.mjs';
import { headlessEnv } from './providers.mjs';
import { costFromUsage, costFromModelUsage } from './pricing.mjs';
import { runClaude, parseStream, extractResult } from './claude-run.mjs';
import { assertTarget, resetTarget, diffStat, diffText } from './target.mjs';
import { buildManifest, writeManifest, writeResult } from './results.mjs';
import { goldSectionsScore, readInjected, listCards, handbackSignals, readFullDiffAfterAgent } from './quality.mjs';
import { loadTasks, armFileFor } from './tasks.mjs';
import { version as commentPolicyVersion } from '../questions/comment-policy.mjs';
import { version as dynamicContextVersion } from '../questions/dynamic-context.mjs';
import { version as handbackCheckVersion } from '../questions/handback-check.mjs';
import { version as modelRouterVersion } from '../questions/model-router.mjs';

// Read-only git only: a session must not commit, reset, or check out in the target.
export const ALLOWED_TOOLS = 'Read,Edit,Write,MultiEdit,Grep,Glob,Bash(git diff),Bash(git diff *),Bash(git status),Bash(git status *),Bash(git log),Bash(git log *),Bash(git show),Bash(git show *),Bash(./gradlew *),Agent';

export const QUESTION_VERSIONS = Object.freeze({ 'comment-policy': commentPolicyVersion, 'dynamic-context': dynamicContextVersion, 'handback-check': handbackCheckVersion, 'model-router': modelRouterVersion });

const USAGE_FIELDS = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'];

/**
 * Side-channel calls for one session. Jev lines add est_tokens; LLM-judge lines (they carry `usage` and `model`)
 * add per-model usage priced from the provider table instead.
 */
async function jevCalls(logDir, areas, sessionId, pricePerMTok, pricing) {
  const answers = []; const judgeUsage = {}; const reasons = {}; let calls = 0; let okCalls = 0; let latency = 0; let tokens = 0;
  for (const area of areas) {
    let text = '';
    try { text = await readFile(join(logDir, `${area}.jsonl`), 'utf8'); } catch { continue; }
    for (const line of text.split('\n').filter(Boolean)) {
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.sessionId !== sessionId || e.event === 'skipped') continue;
      calls += 1; latency += e.latencyMs ?? 0;
      if (e.ok === true) okCalls += 1;
      else { const reason = e.reason ?? 'unknown'; reasons[reason] = (reasons[reason] ?? 0) + 1; }
      if (e.usage && typeof e.usage === 'object' && e.model) {
        const acc = judgeUsage[e.model] ?? Object.fromEntries(USAGE_FIELDS.map((f) => [f, 0]));
        judgeUsage[e.model] = Object.fromEntries(USAGE_FIELDS.map((f) => [f, acc[f] + (e.usage[f] ?? 0)]));
      } else {
        tokens += e.estTokens ?? 0;
      }
      const confs = Object.values(e.answers ?? {}).map((a) => a?.confidence ?? (typeof a?.noul === 'number' ? Math.max(a.noul, 1 - a.noul) : null)).filter((c) => c !== null);
      answers.push({ area, ids: Object.keys(e.answers ?? {}), confidence_min: confs.length ? Math.min(...confs) : null, truncated: e.truncated ?? false });
    }
  }
  const judgeCost = costFromModelUsage(judgeUsage, pricing);
  // An unpriced judge model makes the whole side-channel cost unknown, never silently zero.
  const cost = judgeCost.cost_usd === null ? null : (tokens / 1e6) * pricePerMTok + judgeCost.cost_usd;
  return {
    stats: { calls, ok_calls: okCalls, reasons, latency_ms_total: latency, est_tokens: tokens, judge_usage: judgeUsage, cost_usd: cost, answers },
    warnings: judgeCost.warnings,
  };
}

/** Simple glob to an anchored regex: `**` any path, `*` within one segment, `?` one character. */
function globToRegex(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { out += '.*'; i += 1; } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '.';
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/** Fraction of the task's expect_files globs matched by at least one changed path; null when it has none. */
export function expectFilesHit(globs, files) {
  if (!globs?.length) return null;
  return globs.filter((g) => { const re = globToRegex(g); return files.some((f) => re.test(f)); }).length / globs.length;
}

function runGradle(targetDir, spawnImpl) {
  return new Promise((resolve) => {
    const child = spawnImpl('./gradlew', [':inspector:compileDebugKotlin'], { cwd: targetDir, stdio: 'ignore' });
    const timer = setTimeout(() => { try { child.kill(); } catch { /* gone */ } resolve(false); }, 10 * 60 * 1000);
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
    child.on('error', () => { clearTimeout(timer); resolve(false); });
  });
}

async function qualityFor({ area, arm, task, logDir, sessionId, events, rules, cardsBefore }) {
  const q = { compile: null, gold_sections_recall: null, gold_sections_precision: null, violations_remaining: null, flags_raised: null, orchestrator_read_full_diff: null };
  if (area === 'dynamic-context') {
    const injected = arm === 'jev' ? await readInjected(logDir, sessionId) : arm === 'full' ? rules.filter((r) => !r.always).map((r) => r.id) : null;
    if (injected) Object.assign(q, { gold_sections_recall: goldSectionsScore(injected, task.gold_sections).recall, gold_sections_precision: goldSectionsScore(injected, task.gold_sections).precision });
  }
  if (area === 'handback') {
    const s = await handbackSignals(join(logDir, 'handback'), cardsBefore);
    q.flags_raised = s.flags_raised;
    q.orchestrator_read_full_diff = readFullDiffAfterAgent(events);
  }
  return q;
}

/** One benchmark run: every selected task, `reps` times, under one arm. Never throws per task; refusals throw before any reset. */
export async function runBenchmark(opts) {
  const { area, arm, taskIds = 'all', reps = 1, runId, targetDir, targetName = 'websocket-inspector', config, provider, env, resultsDir, claudeVersion, toolkitCommit, device, yesReset, compile = false } = opts;
  const spawnImpl = opts.spawnImpl ?? nodeSpawn;
  const runGitImpl = opts.runGitImpl;
  const log = opts.log ?? ((m) => console.log(m));
  if (!yesReset) throw new Error('refusing to reset the target without --yes-reset (it discards uncommitted changes)');
  assertTarget({ targetDir, allowedRoots: config.allowedRoots, runGitImpl });
  const runEnv = headlessEnv({ provider, config, env, runId });

  const base = join(toolkitRoot(), 'targets', targetName);
  const armFile = join(base, 'arms', armFileFor(area, arm));
  const rulesDir = join(base, 'rules');
  const rules = await loadRules(rulesDir);
  let tasks = await loadTasks(opts.tasksDir ?? join(base, 'tasks'), taskIds);
  if (area === 'handback') tasks = tasks.filter((t) => t.needs_subagent);

  const model = provider.models[config.benchmark?.orchestratorTier ?? 'opus'];
  const maxTurns = config.benchmark?.maxTurns ?? 30;
  const pricePerMTok = config.benchmark?.jevInputPricePerMTok ?? 0.042;
  await writeManifest(resultsDir, buildManifest({ runId, provider, config, claudeVersion, toolkitCommit, device, questionVersions: { ...QUESTION_VERSIONS } }));

  const written = []; const failures = [];
  for (const task of tasks) {
    for (let rep = 1; rep <= reps; rep += 1) {
      const stem = join(resultsDir, runId, area, arm, `${task.id}-r${rep}`);
      await mkdir(join(resultsDir, runId, area, arm), { recursive: true });
      const record = { run_id: runId, area, arm, task: task.id, rep, orchestrator_model: model, subagent_model: runEnv.CLAUDE_CODE_SUBAGENT_MODEL, raw_result_path: `${stem}.claude.jsonl`, diff_path: `${stem}.diff` };
      try {
        log(`[${area}/${arm}] ${task.id} r${rep}: reset + install`);
        resetTarget({ targetDir, runGitImpl });
        await installArm({ targetDir, armFile, rulesDir, toolkitPath: toolkitRoot() });
        const v = await verifyInstall({ targetDir, armFile, rulesDir, toolkitPath: toolkitRoot() });
        if (!v.ok) throw new Error(`install drift: ${v.problems.join('; ')}`);
        const cardsBefore = await listCards(join(config.logDir, 'handback'));
        log(`[${area}/${arm}] ${task.id} r${rep}: claude -p`);
        const run = await runClaude({ cwd: targetDir, prompt: task.prompt, model, maxTurns, allowedTools: ALLOWED_TOOLS, env: runEnv, spawnImpl, rawOutPath: record.raw_result_path, onChild: opts.onChild });
        const { result, events } = parseStream(run.stdout);
        const res = extractResult(result);
        if (run.timedOut) throw new Error('claude timed out');
        if (run.code !== 0) throw new Error(`claude exit ${run.code}: ${run.stderr.slice(0, 300)}`);
        if (!result) throw new Error('no result event in stream');
        const stat = diffStat({ targetDir, runGitImpl });
        await writeFile(record.diff_path, diffText({ targetDir, runGitImpl }));
        const cost = Object.keys(res.per_model).length ? costFromModelUsage(res.per_model, provider.pricing) : costFromUsage(res.usage, model, provider.pricing);
        const areasForJev = area === 'comment-policy' && arm === 'llm' ? ['comment-policy-llm'] : area === 'handback' ? ['handback-check'] : [area];
        const side = await jevCalls(config.logDir, areasForJev, res.session_id, pricePerMTok, provider.pricing);
        Object.assign(record, {
          subtype: res.subtype, session_id: res.session_id, num_turns: res.num_turns, duration_ms: res.duration_ms,
          usage: { ...res.usage, per_model: res.per_model }, cost_usd: cost.cost_usd, cost_warnings: [...(cost.warnings ?? (cost.warning ? [cost.warning] : [])), ...side.warnings],
          total_cost_usd_reported: res.total_cost_usd_reported,
          diff: { ...stat, expect_files_hit: expectFilesHit(task.expect_files, stat.files) },
          jev: side.stats,
          quality: await qualityFor({ area, arm, task, logDir: config.logDir, sessionId: res.session_id, events, rules, cardsBefore }),
        });
        if (compile) record.quality.compile = await (opts.gradleImpl ?? runGradle)(targetDir, spawnImpl);
      } catch (e) {
        record.subtype = 'failed'; record.error = e.message;
        failures.push({ task: task.id, rep, error: e.message });
        log(`[${area}/${arm}] ${task.id} r${rep}: FAILED ${e.message}`);
      }
      written.push(await writeResult(resultsDir, record));
    }
  }
  return { written, failures };
}
