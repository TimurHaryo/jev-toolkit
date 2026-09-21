# JEV Toolkit

Zero-dependency Node toolkit that puts Jev (TypeSafe AI) decisions into Claude Code hooks and a
benchmark harness. Design: `docs/superpowers/specs/2026-09-21-jev-toolkit-design.md`.

## Hard rules

- **Never write to** `<work checkout>/` or
  `<work checkout copy>/`. Both are WorkApp checkouts.
  Do not create files, run git, or install hooks there. Reading is not needed for this project.
- The only Android project this toolkit may modify is `~/Project/WebSocket Inspector`.
- No `npm install`. `package.json` has no dependencies. Node 20+ built-ins only (`fetch`, `node:test`).
- No WorkApp text in fixtures, rules, tasks, or CLAUDE.md content written for the target.
- `TYPESAFE_API_KEY` is never stored in the repo and is not present on this machine. Tests run in
  `JEV_MODE=replay`.

## Conventions

- ES modules, `.mjs`, JSDoc types. Small files, one responsibility each.
- Tests with `node --test`; every step in the spec's delivery order ends green and committed.
- Commit as `timurharyo00@gmail.com` (set per repo), conventional commit prefixes.
