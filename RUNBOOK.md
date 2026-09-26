# JEV benchmark runbook

For the personal device. Assumes no context beyond this file. Every command runs from the
`jev-toolkit` checkout unless stated. Paths in angle brackets are yours to fill.

## 0. What this measures

Claude Code runs a fixed set of tasks on the WebSocket Inspector, once per "arm". Arms differ in
one thing: whether a Jev hook is in the loop. Results are token usage, cost, duration, and a few
quality signals per task, written under `results/<run-id>/`.

Areas and arms:

| area | arms | what differs |
|---|---|---|
| dynamic-context | full, jev, native | how project rules reach the model |
| comment-policy | none, llm, jev | who judges narration comments on every edit |
| handback | always, jev | whether the parent reads the full diff after every subagent |

The model router is measured offline with `jev-accuracy` (no sessions).

## 1. Prerequisites

- Node 20 or newer (`node --version`).
- Claude Code CLI 2.1 or newer (`claude --version`).
- `git`, and the GitHub CLI logged in (`gh auth status`).
- API keys: TypeSafe (`TYPESAFE_API_KEY`), and DeepSeek (`DEEPSEEK_API_KEY`) or Qwen.
- Disk: a few hundred MB for raw transcripts.

## 2. Clone and configure

    git clone https://github.com/TimurHaryo/jev-toolkit.git
    git clone https://github.com/TimurHaryo/websocket-inspector.git
    cd jev-toolkit
    cp jev.config.example.json jev.config.json

Edit `jev.config.json`:

- `allowedRoots`: the absolute path of the `websocket-inspector` clone (spaces are fine).
- `logDir`: leave as `logs` (inside the toolkit). Never point it inside the target.
- `providers.deepseek.pricing`: update the four prices per model from the provider's price page today.
- `activeProvider`: `deepseek` (or add a `qwen` block with the same shape, including `authHeader`:
  `bearer` for gateways that take `Authorization: Bearer`, `x-api-key` for native Anthropic).
- `benchmark.isolateClaudeConfig`: leave `true`. Every headless session (benchmark, hook check, LLM
  judge) then runs with `CLAUDE_CONFIG_DIR` set to `.claude-config/` inside the toolkit, so your own
  Claude Code settings, hooks, plugins, and memory do not leak into the measurement. The folder is
  gitignored. Set it to `false` only if `jev-hooks-check` fails with an onboarding or login error.

Export keys in the shell you will use:

    export TYPESAFE_API_KEY=...
    export DEEPSEEK_API_KEY=...

Confirm the target has its baseline tag:

    git -C "<websocket-inspector path>" tag        # must print jev-baseline

## 3. First contact with Jev

    node bin/jev-smoke.mjs

PASS prints the raw answers, the resolved `mode`, and `allowedRoots`. FAIL prints a block headed
`PASTE THIS BACK`; send that block to the maintainer before going further.

## 4. Record fixtures and measure Jev accuracy (no sessions)

    node bin/jev-accuracy.mjs --area comment-policy --mode record
    node bin/jev-accuracy.mjs --area dynamic-context --mode record
    node bin/jev-accuracy.mjs --area handback-check --mode record
    node bin/jev-accuracy.mjs --area model-router --mode record

Each prints agreement, per-question precision and recall, and calibration buckets. Then the LLM
comparison for the two areas where it matters:

    node bin/jev-accuracy.mjs --area comment-policy --judge llm
    node bin/jev-accuracy.mjs --area model-router --judge llm

The LLM judge always runs live against the configured provider (`activeProvider`, its key must be
exported; the model is `models.haiku` unless `JEV_JUDGE_MODEL` is set), whatever `--mode` says. The
second output line is `skipped <n> of <total>`; the command exits 2 when every case was skipped.

`--judge api` asks the provider's Messages endpoint directly with the same prompt, so its tokens and
latency carry no CLI system prompt or cold start. Every judge ends with a cost line (decisions,
median and p90 latency, input and output tokens, USD); Jev's input tokens are an estimate, and its
latency is not real in `--mode replay`. `--dump <path>` writes one JSON line per case with the
compared rows.

    node bin/jev-accuracy.mjs --area comment-policy --judge api --dump reports/accuracy/comment-policy-api.jsonl

Commit the recordings so replays work everywhere:

    git add fixtures/recordings && git commit -m "chore: record Jev responses" && git push

## 5. First contact with the hooks

This resets the target to `jev-baseline` (discarding any local edits there), installs every hook,
runs three tiny sessions, installs the LLM comment-policy arm and runs a fourth, and resets again:

    node bin/jev-hooks-check.mjs --target "<websocket-inspector path>" --yes-reset

Expect eight `PASS` lines. Any `FAIL` means a hook contract differs on this machine; paste the
output back before running the benchmark.

## 6. Run the benchmark

Start with one repetition to prove the pipeline, then three for medians. Each command resets the
target before every task. `<id>` is a run id you choose, for example `2026-10-01-deepseek-a`.

Before the first run:

- Start the runner from a plain terminal, not from inside a Claude Code session.
- Task 15 runs Gradle, and the first Gradle run on a fresh device can take many minutes (daemon,
  wrapper download, dependencies). Run it once by hand so the benchmark does not pay for that:

      (cd "<websocket-inspector path>" && ./gradlew :inspector:compileDebugKotlin)

- DeepSeek's context window is about 128K tokens, so long subagent tasks may end with a context
  error; those show up as failed or incomplete runs. `deepseek-reasoner` as orchestrator
  (`models.opus`) must be confirmed to use tools in the one-repetition run; if its sessions make no
  tool calls or fail, set `models.opus` to `deepseek-chat` and start a new run id.

    T="<websocket-inspector path>"
    node bin/jev-bench.mjs --area dynamic-context --arm full   --target "$T" --run-id <id> --reps 1 --yes-reset
    node bin/jev-bench.mjs --area dynamic-context --arm jev    --target "$T" --run-id <id> --reps 1 --yes-reset
    node bin/jev-bench.mjs --area dynamic-context --arm native --target "$T" --run-id <id> --reps 1 --yes-reset
    node bin/jev-bench.mjs --area comment-policy  --arm none   --target "$T" --run-id <id> --reps 1 --yes-reset
    node bin/jev-bench.mjs --area comment-policy  --arm llm    --target "$T" --run-id <id> --reps 1 --yes-reset
    node bin/jev-bench.mjs --area comment-policy  --arm jev    --target "$T" --run-id <id> --reps 1 --yes-reset
    node bin/jev-bench.mjs --area handback        --arm always --target "$T" --run-id <id> --reps 1 --yes-reset
    node bin/jev-bench.mjs --area handback        --arm jev    --target "$T" --run-id <id> --reps 1 --yes-reset

`--tasks 01-theme-color,13-explain-frame-path` limits a run; `--compile` adds a Gradle compile check
per task (needs the Android SDK; slow). Exit code 2 means some tasks failed or were incomplete
(for example a session that hit the turn cap) but results were written. That is data: keep going
with the next command. Runs that produced usage count as incomplete runs in the report; runs with
no usage are listed under Excluded. Only exit code 3 (a refusal) or a crash stops the sequence.

The handback area runs only the three subagent tasks, so its `n` is 3 per rep.

Sanity check after the one-repetition run, before spending on three:

    node bin/jev-report.mjs --run-id <id>

- every arm has `n` close to its task count (15, or 3 for handback) and few `excluded runs`;
- `side-channel ok rate` is near 100% for the `jev` and `llm` arms;
- every model under `usage.per_model` in a couple of `results/<id>/**/*.json` files has a price in
  `jev.config.json` (the Excluded list names any unpriced model);
- `logs/comment-policy-llm.jsonl` has `"ok":true` lines.

When one repetition looks sane, repeat the eight commands with `--reps 3` and a new `<id>`. Arm order
affects prompt-cache hits (a later arm can reuse a cache the earlier arm warmed), so run the eight
commands in reverse order for the `--reps 3` run.

## 7. Hand-label comment violations

For every comment-policy result, open `results/<id>/comment-policy/<arm>/<task>-r<rep>.diff`,
count comments in the diff that narrate the code or restate a signature, and append one line per
result to `labels/<id>.jsonl` (create the folder first with `mkdir -p labels`):

    {"area":"comment-policy","arm":"jev","task":"06-clean-decorator-comments","rep":1,"violations_remaining":2}

## 8. Report and send back

    node bin/jev-report.mjs --run-id <id>

Look at `results/<id>/report.md` and a couple of result files before committing. A
`warning: label did not match any record` line means a typo in the labels file.

After changing prices in `jev.config.json`, regenerate with `node bin/jev-report.mjs --run-id <id>
--reprice`: it recomputes every cost (session and side-channel) from the stored usage with the
current prices, and the report header says so. Without `--reprice` only unknown costs are filled.

    git add results/<id> labels && git commit -m "results: <id>" && git push

The report is also written to `results/<id>/report.md`. Raw transcripts (`*.claude.jsonl`) stay
local by design.

## 9. Optional: Claude calibration sample

Run five tasks once on native Anthropic, under both the `full` and the `jev` arm, to check the
DeepSeek numbers point the same way.

1. Fill `providers.anthropic.pricing` in `jev.config.json` first: the four prices per model for every
   model under `providers.anthropic.models`, from Anthropic's price page today.
2. Run both arms:

       export ANTHROPIC_API_KEY=...
       C=01-theme-color,04-cancel-scope,06-clean-decorator-comments,10-frame-repository,13-explain-frame-path
       node bin/jev-bench.mjs --area dynamic-context --arm full --target "$T" --run-id <id>-claude --provider anthropic --tasks "$C" --reps 1 --yes-reset
       node bin/jev-bench.mjs --area dynamic-context --arm jev  --target "$T" --run-id <id>-claude --provider anthropic --tasks "$C" --reps 1 --yes-reset

3. Compare:

       node bin/jev-report.mjs --run-id <id> --compare <id>-claude

## 10. If something goes wrong

- `refused: ... allowedRoots`: fix the path in `jev.config.json`.
- `refused: tag jev-baseline is missing`: `git -C "$T" fetch --tags`.
- `install drift`: the target's `CLAUDE.md` or `.claude/` was edited by hand; delete them and rerun.
- `claude timed out`: the task hung; rerun that task with `--tasks <id>`.
- `cost_usd null` in the report: add the price and rerun `jev-report`; the report recomputes cost from stored usage.
- Hooks silently not firing: `node bin/jev-hooks-check.mjs` again, then check `logs/*.jsonl` for `skipped` lines and their `reason`.
- Everything Jev-related can be switched off with `JEV_DISABLE=1` in the environment.

Note: from round 5 on, the hand-back card lists files the summary names but the diff lacks on a separate
`Mentioned but unchanged:` line instead of raising them as flags. Flag counts from earlier runs are
therefore not comparable with later ones.
