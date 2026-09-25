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
- `activeProvider`: `deepseek` (or add a `qwen` block with the same shape).

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

Commit the recordings so replays work everywhere:

    git add fixtures/recordings && git commit -m "chore: record Jev responses" && git push

## 5. First contact with the hooks

This resets the target to `jev-baseline` (discarding any local edits there), installs every hook,
runs three tiny sessions, and resets again:

    node bin/jev-hooks-check.mjs --target "<websocket-inspector path>" --yes-reset

Expect six `PASS` lines. Any `FAIL` means a hook contract differs on this machine; paste the
output back before running the benchmark.

## 6. Run the benchmark

Start with one repetition to prove the pipeline, then three for medians. Each command resets the
target before every task. `<id>` is a run id you choose, for example `2026-10-01-deepseek-a`.

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
per task (needs the Android SDK; slow). Exit code 2 means some tasks failed but results were
written; the report lists them under Excluded.

When one repetition looks sane, repeat the eight commands with `--reps 3` and a new `<id>`.

## 7. Hand-label comment violations

For every comment-policy result, open `results/<id>/comment-policy/<arm>/<task>-r<rep>.diff`,
count comments in the diff that narrate the code or restate a signature, and append one line per
result to `labels/<id>.jsonl`:

    {"area":"comment-policy","arm":"jev","task":"06-clean-decorator-comments","rep":1,"violations_remaining":2}

## 8. Report and send back

    node bin/jev-report.mjs --run-id <id>
    git add results/<id> labels && git commit -m "results: <id>" && git push

The report is also written to `results/<id>/report.md`. Raw transcripts (`*.claude.jsonl`) stay
local by design.

## 9. Optional: Claude calibration sample

Run five tasks once on native Anthropic to check the DeepSeek numbers point the same way:

    export ANTHROPIC_API_KEY=...
    node bin/jev-bench.mjs --area dynamic-context --arm jev --target "$T" --run-id <id>-claude --provider anthropic --tasks 01-theme-color,04-cancel-scope,06-clean-decorator-comments,10-frame-repository,13-explain-frame-path --reps 1 --yes-reset
    node bin/jev-report.mjs --run-id <id> --compare <id>-claude

## 10. If something goes wrong

- `refused: ... allowedRoots`: fix the path in `jev.config.json`.
- `refused: tag jev-baseline is missing`: `git -C "$T" fetch --tags`.
- `install drift`: the target's `CLAUDE.md` or `.claude/` was edited by hand; delete them and rerun.
- `claude timed out`: the task hung; rerun that task with `--tasks <id>`.
- `cost_usd null` in the report: add the model's prices to `jev.config.json` and rerun the report.
- Hooks silently not firing: `node bin/jev-hooks-check.mjs` again, then check `logs/*.jsonl` for `skipped` lines and their `reason`.
- Everything Jev-related can be switched off with `JEV_DISABLE=1` in the environment.
