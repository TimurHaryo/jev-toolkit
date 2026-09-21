# JEV Toolkit

Puts [Jev](https://typesafe.ai) decisions (Choice / Score / Noul) into Claude Code hooks and a
benchmark harness. Zero npm dependencies. Node 20+.

Design: `docs/superpowers/specs/2026-09-21-jev-toolkit-design.md`.
Plans: `docs/superpowers/plans/`.

## Status

Plan 1 done: client, smoke, comment-policy hook, fixtures, accuracy script.
Plan 2 (target install, dynamic context, hand-back, router) and plan 3 (benchmark runner,
reporter, runbook) follow.

## Setup on a device that has a TypeSafe key

    cp jev.config.example.json jev.config.json   # fill allowedRoots with your target project path
    export TYPESAFE_API_KEY=...
    node bin/jev-smoke.mjs                        # one live call; paste the block back if it fails
    node bin/jev-accuracy.mjs --area comment-policy --mode record   # records responses into fixtures/recordings

## Tests (no network, no key)

    node --test

## Dry-run the comment-policy hook

Copy `examples/settings.comment-policy.json` into `<target>/.claude/settings.json`, replace the
absolute path, add the target to `allowedRoots`, then edit a `.kt` file in a Claude Code session.
A narration comment such as `// increment counter` above `counter++` is denied with a reason.
`JEV_DISABLE=1` turns every hook into a no-op.

## Layout

    src/client      decide(area, state) – guard, timeout, retry, record/replay, log
    src/questions   one module per area: buildQuestions, truncate, thresholds, version
    src/adapters    hooks and CLIs, thin; pure decision logic in its own module
    src/bench       accuracy scoring (runner and reporter arrive in plan 3)
    fixtures        labeled cases and recorded responses
