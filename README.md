# JEV Toolkit

Puts [Jev](https://typesafe.ai) decisions (Choice / Score / Noul) into Claude Code hooks and a
benchmark harness. Zero npm dependencies. Node 20+.

Design: `docs/superpowers/specs/2026-09-21-jev-toolkit-design.md`.
Plans: `docs/superpowers/plans/`.

## Status

Plan 1 done: client, smoke, comment-policy hook, fixtures, accuracy script.
Plan 2 done: WebSocket Inspector target repo, rule sections, `jev-install`, dynamic-context hook,
hand-back check (SubagentStart snapshot + SubagentStop card), model-router CLI and skill, fixtures.
Plan 3 (benchmark runner, reporter, runbook) follows.

## Setup on a device that has a TypeSafe key

    git clone https://github.com/TimurHaryo/websocket-inspector.git   # the benchmark target
    cp jev.config.example.json jev.config.json   # add the target's absolute path to allowedRoots
    export TYPESAFE_API_KEY=...
    node bin/jev-smoke.mjs                        # one live call; paste the block back if it fails
    node bin/jev-accuracy.mjs --area comment-policy --mode record   # records responses into fixtures/recordings

## Tests (no network, no key)

    node --test

## Dry-run the comment-policy hook

Copy `examples/settings.comment-policy.json` into `<target>/.claude/settings.json`, replace the
absolute path, add the target to `allowedRoots`, then edit a `.kt` file in a Claude Code session.
A narration comment such as `// increment counter` above `counter++` is denied with a reason.
Edit, Write, and MultiEdit are all checked; MultiEdit edits are examined together.
The hook is inert (allows everything, logs a skip) when `jev.config.json` is missing or the project
is not under `allowedRoots`.
`JEV_DISABLE=1` turns every hook into a no-op.

## Install an arm into the target

    node bin/jev-install.mjs --target "/absolute/path/WebSocket Inspector" --arm all-jev

Arms live in `targets/websocket-inspector/arms/`. `jev-install` owns `CLAUDE.md`, `.claude/settings.json`'s
`hooks` key, and the rules folder it writes; it refuses targets outside `allowedRoots`, an unmanaged
rules folder, and a malformed settings file. Switching arms is one command. The target's `.gitignore`
excludes `CLAUDE.md` and `.claude/` so the baseline stays clean. Keep `logDir` outside the target
repository, otherwise the hand-back check attributes log files to subagents.

## Route a brief

    node bin/jev-route.mjs --brief /path/to/brief.md

## Layout

    src/client      decide(area, state) – guard, timeout, retry, record/replay, log
    src/questions   one module per area: buildQuestions, truncate, thresholds, version
    src/adapters    hooks and CLIs, thin; pure decision logic in its own module
    src/targets     rule loading, CLAUDE.md variants, jev-install
    src/bench       accuracy scoring (runner and reporter arrive in plan 3)
    fixtures        labeled cases and recorded responses
    skills          model-router SKILL.md
    targets         per-target rule sections and benchmark arms
