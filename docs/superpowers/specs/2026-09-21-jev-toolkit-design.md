# JEV Toolkit: Design Spec

Date: 2026-09-21
Status: approved in discussion, awaiting written review

## 1. Purpose

Measure whether Jev, TypeSafe AI's decision model, can take structured decisions out of an
LLM-driven Android development loop and what that does to main-LLM token cost, latency, and
decision quality. The toolkit is built and tested on personal projects first. WorkApp is a later
target, only after TypeSafe's data-handling terms are reviewed and WorkApp approves.

Jev in one paragraph: a hosted model that takes a text or JSON `state` plus a map of typed
`questions` and returns typed answers in one parallel pass, typically 70 to 500 ms. Three
primitives: **Choice** (pick one of up to 255 options, returns `choice`, `probabilities`,
`confidence`), **Score** (position on an ordered rubric, returns `score`, `probabilities`,
`confidence`, `legend`), **Noul** (probability 0 to 1 that a statement is true, returns `noul`).
It generates no text, reads no images, and must not be asked to count, compare numbers, or
extract arbitrary values. Endpoint: `POST https://api.typesafe.ai/v1/systemone`, bearer auth,
body `{ model, state, questions }`. Budget about 64k tokens per call, 32k per question plus state.

## 2. Goals

1. Four working adapters that put a Jev decision at a real decision point in a Claude Code
   session: comment policy, hand-back sanity check, model router, dynamic context.
2. A benchmark harness that runs a fixed task set with and without Jev in the loop and produces
   comparable results, driven by Claude Code CLI against DeepSeek or Qwen through an
   Anthropic-compatible endpoint, with an optional Claude calibration sample.
3. Labeled fixtures per area and an accuracy report, so thresholds are tuned against data.
4. A runbook that lets someone on another device with no context from this design run the
   whole benchmark and send results back.

## 3. Non-goals

- No CI integration. Test impact ranking is deferred.
- No device or Robolectric UI assertions. Deferred to a second track.
- No symptom-to-fix command in v1. The target CLAUDE.md includes a gotcha table so it can be
  added later without new fixtures.
- Jev never writes or rewrites code or comments. It only decides. The driving LLM does the
  rewriting.
- No attempt to make Jev verify claims it cannot see evidence for. It judges what a summary
  claims; code computes facts.

## 4. Constraints

| Constraint | Consequence |
|---|---|
| WorkApp checkouts on the build machine (`work checkout`, `work checkout copy`) are off limits | Nothing is written there: no files, no git, no hooks. The WebSocket Inspector is the only Android project the toolkit modifies. |
| Jev is early access with unreviewed data terms | Only the user's own material is sent. No WorkApp source, diffs, rules, or prompts. The target CLAUDE.md is written fresh for the WebSocket Inspector. |
| Toolkit is built on the work machine, run on a personal machine | Zero runtime npm packages. Node 20+ built-in `fetch` and `node:test` only. Nothing is installed. The API key never exists on the build machine. |
| Personal machine drives Claude Code with DeepSeek or Qwen | Cost is computed from usage tokens times a per-provider price table, never from the headless `total_cost_usd` field. Tier aliases are mapped through the `ANTHROPIC_DEFAULT_*_MODEL` variables per arm. |
| Hooks must never stall a session | Three-second timeout, one retry, fail open with a logged outage. |
| Numbers must be reproducible | Jev model pinned to an exact version. Claude Code version, provider, and model mapping recorded in every run manifest. |

## 5. Repository layout

Repo `jev-toolkit` (this directory), private on GitHub. Target repo `websocket-inspector`,
private on GitHub, initialised from `~/Project/WebSocket Inspector` with a gitignore for IDE,
build, Gradle cache, and `local.properties`. Both repos commit as `timurharyo00@gmail.com`.

```
jev-toolkit/
  package.json                 name, "type": "module", scripts only; no dependencies
  jev.config.example.json      committed; jev.config.json is device-local and ignored
  RUNBOOK.md                   the handoff (section 12)
  bin/
    jev-smoke.mjs              one live call, schema check, raw body print
    jev-route.mjs              model router CLI
    jev-install.mjs            install a target + arm
    jev-bench.mjs              benchmark runner
    jev-report.mjs             results folder to markdown
    jev-accuracy.mjs           fixtures to accuracy report
  src/
    client/
      jev-client.mjs           call, timeout, retry, truncation, mode switch, logging
      schema.mjs               request builders and response validation
      recorder.mjs             record and replay store
      guard.mjs                allowed-roots check, kill switch
      log.mjs                  JSONL append
      tokens.mjs               rough token estimate for truncation
    questions/
      comment-policy.mjs
      handback-check.mjs
      model-router.mjs
      dynamic-context.mjs
    adapters/
      comment-policy/hook.mjs, comments.mjs (tokenizer), filters.mjs
      handback-check/hook.mjs, facts.mjs
      model-router/route.mjs
      dynamic-context/hook.mjs, sections.mjs, session-state.mjs
    hooks/
      io.mjs                   read stdin JSON, write hook JSON, exit codes
    bench/
      runner.mjs, arms.mjs, pricing.mjs, results.mjs, report.mjs, quality.mjs
  fixtures/
    comment-policy/cases.jsonl
    handback-check/cases.jsonl
    model-router/cases.jsonl
    dynamic-context/cases.jsonl
    recordings/<area>/<hash>.json
  skills/model-router/SKILL.md
  targets/websocket-inspector/
    CLAUDE.core.md             always-on stub content
    rules/*.md                 one file per section, frontmatter: id, summary, paths
    arms/*.json                per-arm settings fragments and env
    tasks/NN-<slug>.md         benchmark tasks with gold labels in frontmatter
  test/                        node:test suites, replay mode only
  docs/superpowers/specs/
```

## 6. Shared client

`decide(area, state, options)`:

1. `guard` checks `process.cwd()` is under one of `config.allowedRoots`; otherwise throws
   `NotAllowedRoot` and the adapter exits allow with a logged reason. Adapters also check the
   guard and `configMissing` themselves before any deterministic verdict, so an unconfigured
   install is inert and writes a `skipped` log line. `JEV_DISABLE=1` makes every adapter a
   no-op; by plan choice the disabled path writes no log line and has no side effects.
   `allowedRoots` are normalised at load: `~` is expanded, relative and empty entries are
   dropped, and the guard ignores any non-absolute root.
2. Loads `questions/<area>.mjs`, which exports `{ version, thresholds, buildQuestions(state),
   truncate(state) }`; questions are built per state because some areas ask one question per
   item. The model is `config.model` (pinned, initial value `jev-1.13.0`). Any unexpected
   error inside `decide` is returned as `reason: "internal"`; `decide` never throws.
3. `tokens.estimate(state)`; if over `config.maxStateTokens` (default 24000) the area's
   `truncate(state)` is applied and `truncated: true` is recorded.
4. Mode from `config.mode` or `JEV_MODE`: `live` calls the API; `record` calls and stores the
   response under `fixtures/recordings/<area>/<sha256(state+questions)>.json`; `replay` reads the
   stored response and throws `NoRecording` if absent. Tests run in `replay`.
5. `fetch` with `AbortController` at `config.timeoutMs` (default 3000). One retry on network
   error, 429, or 5xx. On final failure returns `{ ok: false, reason }`; adapters treat this as
   fail open.
6. Response validated by `schema.validateAnswers(questions, body)`. Shape mismatch is `ok: false`
   with `reason: "schema"` and the raw body attached for the smoke output.
7. Appends one JSONL line to `<config.logDir>/<area>.jsonl`: timestamp, area, question version,
   model, mode, state chars, estimated tokens, truncated, latency ms, answers, confidences,
   session id if the adapter has one, `ok`, `reason`.
8. Returns `{ ok: true, answers, meta: { latencyMs, model, truncated, mode } }`.

Request body: `{ model, state, questions: { [id]: { type, instructions, criteria } } }`.
Criteria: Noul takes `{ true, false }` descriptions; Choice takes `{ [option]: description |
null }`; Score takes an ordered array of level descriptions.

## 7. Question files

Each file is the reviewable artifact for its area. It holds concrete-situation criteria, the
thresholds, a `version`, and a `tuned` note stating the fixture set and date thresholds were last
tuned against. Initial thresholds below are starting points; `jev-accuracy` output is the only
justification for changing them.

### 7.1 comment-policy

State: `{ comments: [{ id, text, kind: "line"|"block"|"kdoc", code_after: string }] }`,
at most 20 comments per call; more are chunked into further calls.

Questions per comment `i`:

- `narrates_<i>` (Noul): the comment says what `code_after` visibly does, and adds no reason,
  constraint, or warning. True criteria: describes the operation the next lines perform, in the
  same words as the code. False criteria: explains why, names a workaround, ordering, platform
  quirk, or race, or is a one-line summary of a public type.
- `restates_signature_<i>` (Noul, KDoc only): the KDoc repeats parameter names and types or
  the return type with no added meaning.
- `kind_<i>` (Choice): `narration`, `reason`, `public_summary`, `todo`, `other`.

Thresholds: `deny` when any `narrates` or `restates_signature` is at or above 0.80; `advise`
when any is between 0.50 and 0.80; otherwise allow silently.

### 7.2 handback-check

State: `{ summary: string, agent_type: string }`. Facts are not sent to Jev; they are combined in
code.

Questions (Noul):

- `claims_tests_run`: the summary states tests were executed.
- `claims_tests_pass`: the summary states tests passed or are green.
- `claims_build_ok`: the summary states the build or compile succeeded.
- `claims_tests_added`: the summary states new tests were written.
- `claims_complete`: the summary presents the work as finished with nothing left out.
- `reports_blocker`: the summary reports something skipped, failed, or blocked.

Flag rules (code): `claims_tests_added >= 0.80 && !facts.testFilesChanged`;
`claims_complete >= 0.80 && reports_blocker >= 0.50`; `facts.mentionedNotInDiff.length > 0`;
`claims_tests_pass >= 0.80 && facts.filesChanged === 0`. Every card lists `claims_build_ok` and
`claims_tests_pass` under "unverified claims" regardless, because the hook cannot see the
subagent's shell output.

### 7.3 model-router

State: `{ brief: string }`.

Questions:

- `tier` (Choice): `haiku` (find a file, grep a symbol, which module owns a resource),
  `sonnet` (trace a field across layers, follow REST and WebSocket paths, write tests for an
  existing class, copy a worked pattern across files, simple slice in a parallel fan-out),
  `opus` (implement a slice from a spec, change behaviour across several files, review a diff,
  make an architectural decision). Criteria text is derived from the user's routing table.
- `needs_broad_exploration` (Noul): completing the brief requires reading several layers or
  many files before any answer.
- `asks_for_change` (Noul): the brief asks for code, files, or configuration to be created or
  modified, as opposed to explained, found, or reviewed.

Fallback: `tier.confidence < 0.60` returns `opus` when `asks_for_change >= 0.50` and `sonnet`
otherwise, with `fallback_used: true`.

### 7.4 dynamic-context

State: `{ prompt: string, sections: [{ id, summary }] }`. Summaries only, never full text.

Questions: one Noul per section, `relevant_<id>`: carrying out the prompt would require
following this section's rules. Threshold 0.50. The `core` section is never asked about and
always injected. Injected total is capped at `config.contextBudgetTokens` (default 6000),
highest probabilities first.

## 8. Adapters

### 8.1 comment-policy (PreToolUse, matcher `Edit|Write|MultiEdit`)

Input: hook stdin `tool_name`, `tool_input.file_path`, and `tool_input.new_string` (Edit),
`tool_input.content` (Write), or the joined `edits[].new_string` (MultiEdit). Files not ending
`.kt` or `.kts` exit allow immediately. A trailing line comment (code before `//` on the same
line) is judged against that same-line code; otherwise `code_after` is the code up to the next
comment, at most three non-blank lines. Chunks of 20 comments are sent concurrently.

Pipeline: `comments.extract(text)` tokenises line, block, and KDoc comments while skipping
string and char literals, and captures up to three following non-blank lines as `code_after`.
`filters.apply` removes in code: comments containing the marker `jev:allow`; `TODO` and `FIXME`;
commented-out code (line ends with `{`, `}`, `;`, or starts with a Kotlin keyword such as `val`,
`fun`, `return`, `if`); banners (three or more repeated `=`, `-`, or `*`); step numbering
(`Step 1`, `1.`). Banners and commented-out code are reported as deterministic violations without
a Jev call. Remaining comments go to `decide("comment-policy", ...)`.

Output: deterministic violations or any Jev answer at `deny` threshold produce
`{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
permissionDecisionReason } }` where the reason lists each offending comment with its line
number, the rule it breaks, and the one-line policy: comments explain why, never what. `advise`
produces `permissionDecision: "allow"` with `additionalContext` holding the same list marked
advisory. Otherwise allow with no output.

Loop guard: `session-state` records `sha256(file_path + text)` per `session_id` with a deny
count; a third identical attempt is allowed with an advisory so a model cannot loop.

### 8.2 handback-check (PreToolUse and PostToolUse on the `Agent` tool)

Verified against Claude Code 2.1.278: a SubagentStop hook's `additionalContext` is delivered to
the subagent and makes it continue, never to the parent. The check therefore runs in the parent's
own turn: a PreToolUse hook matched on `Agent` records a content-hash snapshot of the dirty tree
keyed by `tool_use_id`; the PostToolUse hook for the same call computes the changed set as the
difference, so files dirty before the subagent began are not attributed to it. Without a
snapshot the check falls back to the dirty tree against HEAD and says `attribution head`. The
summary is the `tool_response` text; the agent type is `tool_input.subagent_type`; the model is
`tool_input.model` or `CLAUDE_CODE_SUBAGENT_MODEL`. A background dispatch (response text
"Async agent launched") is skipped, so benchmark subagents must run in the foreground.

`collectFacts(cwd, { before })`: NUL-separated `git status --porcelain -z -uall` and
`git ls-files --others -z` give `filesChanged`, `testFilesChanged` (any path containing `/test/`,
`/androidTest/`, or ending `Test.kt`), `insertions`, `deletions`, `untracked`, `attribution`.
`mentionedNotInDiff` is the set of paths matching `[\w./-]+\.(kt|kts|gradle|xml|md|mjs|json)` in the
summary (leading `./` and `../` stripped) that no changed path ends with. If `cwd` is not a git
repo the hook emits nothing. Subagent types `Explore`, `Plan`, `claude-code-guide` are excluded
inside the adapter.

Output: `{ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext } }`, which
reaches the parent model; the same card is written to `<logDir>/handback/<tool_use_id>.card.md`
for the benchmark. The card is a fixed-format block:

```
JEV hand-back check (<agent_type>, <model>)
Flags: <none | one line per flag>
Facts: files changed <n> (<list, max 8>), test files changed <yes/no>, +<ins>/-<del>, untracked <n>, attribution <snapshot|head>
Claims: tests run <p>, tests pass <p>, build ok <p>, tests added <p>, complete <p>, blocker <p>
Unverified: build ok, tests pass
Read full diff: <yes if any flag, else "stat only is sufficient">
```

### 8.3 model-router (CLI + skill)

`bin/jev-route.mjs` reads the brief from `--brief <file>` or stdin, calls
`decide("model-router")`, prints JSON `{ tier, confidence, probabilities,
needs_broad_exploration, fallback_used, latency_ms }`, and exits 0. On `ok: false` prints
`{ tier: null, error }` and exits 3 so the skill falls back to the human table.

`skills/model-router/SKILL.md`: before any Agent dispatch, pipe the brief to the CLI, use the
returned tier, and state the model in one line when dispatching. If exit code is 3, use the
routing table by hand. Never upgrade above the returned tier without saying why.

### 8.4 dynamic-context (UserPromptSubmit)

Input: `user_prompt`, `session_id`, `cwd`.

`sections.load(cwd)` reads `<target>/.claude/jev-rules/*.md`. Each file has frontmatter
`id`, `summary` (one line), `paths` (globs used by the native-rules arm), and the body.
`session-state` holds the set of section ids already injected for this `session_id`.

Call `decide("dynamic-context", { prompt, sections: summaries of not-yet-injected sections })`.
Select ids at or above threshold, order by probability, cut at the token budget, mark injected,
and emit `{ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext } }`
where the context begins `Project rules selected for this task (JEV):` followed by each
selected section's body under its heading. If nothing is selected, emit nothing.

## 9. Target: WebSocket Inspector

Initialisation: `.gitignore` (`.gradle/`, `.idea/`, `build/`, `*/build/`, `local.properties`,
`.DS_Store`, `*.iml`), baseline commit `chore: baseline for JEV benchmark`, tag `jev-baseline`.
The benchmark resets to this tag between tasks with `git reset --hard jev-baseline && git clean
-fd`. The first reset only runs after the user confirms in the runbook step.

CLAUDE.md content: written fresh about this project, in the shape of a large production
Android CLAUDE.md, with these eleven sections (the `paths` globs below are illustrative; the
shipped files under `targets/websocket-inspector/rules/` are normative), each also a file in `jev-rules/` and in
`.claude/rules/` for the native arm:

| id | summary | paths |
|---|---|---|
| core | project overview, build commands, module map | always on |
| architecture | layer rules, allowed dependencies between `inspector`, `example`, `app` | `**/*.kt` |
| compose | Compose rules, previews, state hoisting, theme tokens | `**/ui/**`, `**/*Screen*.kt` |
| coroutines | Flow, StateFlow, dispatcher injection, cancellation | `**/*ViewModel*.kt`, `**/*Repository*.kt` |
| websocket | frame model, protobuf decode path, reconnect rules | `**/inspector/**` |
| room | Room entities, DAO conventions, migrations | `**/data/**/*.kt` |
| testing | test naming, MockK use, what to test per layer | `**/test/**` |
| comments | the comment policy in words | `**/*.kt` |
| naming | file, class, and resource naming | `**/*.kt`, `**/res/**` |
| gotchas | symptom, cause, fix table for known issues in this project | `**/*.kt` |
| git | commit format, branch naming | none, on demand only |

Arms write different `CLAUDE.md` files: `full` inlines every rule body after the core section;
`stub` contains only `core` and a line saying rules are injected per task; `native` contains
`core` and relies on `.claude/rules/*.md` with `paths` frontmatter.

Tasks: 15 prompts in `targets/websocket-inspector/tasks/`, each with frontmatter
`id`, `category`, `gold_sections` (list of ids), `gold_tier`, `expect_files` (globs),
`needs_subagent` (bool). Categories and counts: 5 one-file edits, 4 comment-heavy edits (add
or refactor code in files seeded with narration comments), 3 multi-file slices that require a
subagent, 3 information requests (explain, trace, find). Concrete prompts are written during
planning after reading the target's code, and each is checked to reference no WorkApp material.

## 10. Benchmark

### 10.1 Arms

| Area | Arm | What differs |
|---|---|---|
| dynamic-context | `full` | CLAUDE.md imports all rules; no hook |
| | `jev` | stub CLAUDE.md; UserPromptSubmit hook |
| | `native` | core CLAUDE.md; path-scoped `.claude/rules` |
| comment-policy | `none` | no hook |
| | `llm` | same PreToolUse hook but the decision comes from one headless call to the cheapest mapped model with the same criteria text |
| | `jev` | Jev hook |
| handback-check | `always` | orchestrator instructions: always read the full diff after a subagent returns; no hook |
| | `jev` | Agent PreToolUse/PostToolUse hand-back hooks; orchestrator instructions: read the full diff only when the card has a flag |
| model-router | offline | 30 labeled briefs in fixtures; `jev` versus `llm` judge; no session runs |

Arms outside the dynamic-context area use the `full` CLAUDE.md so context is held constant
while one hook varies. Hand-back runs use the `needs_subagent` tasks only. Orchestrator and subagent must be on
different mapped models so per-model usage separates them. `CLAUDE_CODE_SUBAGENT_MODEL` is set
per arm.

### 10.2 Runner

`node bin/jev-bench.mjs --area <a> --arm <arm> --tasks all|<ids> --reps <n> --run-id <id>
[--compile]`. For each task and repetition:

1. Reset target to `jev-baseline`.
2. `jev-install --target <path> --arm <area>/<arm>` writes `.claude/settings.json`, `CLAUDE.md`,
   `.claude/jev-rules/`, `.claude/rules/` as the arm requires. Hook commands are absolute paths
   to this toolkit on the running device, taken from config.
3. Run from the target directory:
   `claude -p "<task prompt>" --output-format json --model <mapped> --max-turns <config>
   --permission-mode acceptEdits --allowedTools "Read,Edit,Write,Grep,Glob,Bash(git *),Agent"`
   with the arm's environment: `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`,
   `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL`, `CLAUDE_CODE_SUBAGENT_MODEL`, `JEV_MODE=live`,
   `JEV_RUN_ID`, `JEV_LOG_DIR`.
4. Capture the result JSON, `git diff jev-baseline --stat` and full diff, and the Jev log lines
   tagged with this `JEV_RUN_ID` and task.
5. Optional `--compile` runs `./gradlew :inspector:compileDebugKotlin` and records pass/fail.
6. Write `results/<run-id>/<area>/<arm>/<task>-r<rep>.json`.

`results/<run-id>/manifest.json` is written once per run: device label, OS, Node version,
Claude Code version (`claude --version`), provider, base URL host, model mapping, Jev model pin,
question file versions, toolkit commit, date.

### 10.3 Per-run result file

```json
{
  "run_id": "2026-09-28-deepseek-a",
  "area": "dynamic-context", "arm": "jev", "task": "07-add-reconnect-backoff", "rep": 1,
  "usage": { "input_tokens": 0, "output_tokens": 0, "cache_creation_input_tokens": 0,
             "cache_read_input_tokens": 0, "per_model": {} },
  "cost_usd": 0.0, "duration_ms": 0, "num_turns": 0, "subtype": "success",
  "diff": { "files": [], "insertions": 0, "deletions": 0, "expect_files_hit": 0.0 },
  "jev": { "calls": 0, "latency_ms_total": 0, "est_tokens": 0, "cost_usd": 0.0,
           "answers": [ { "area": "", "ids": [], "confidence_min": 0.0, "truncated": false } ] },
  "quality": { "compile": null, "gold_sections_recall": null, "gold_sections_precision": null,
               "violations_remaining": null, "flags_raised": null, "orchestrator_read_full_diff": null },
  "raw_result_path": "…/07-add-reconnect-backoff-r1.claude.json"
}
```

`cost_usd` is `sum(tokens_by_kind * price_by_kind)` from `pricing.mjs`, keyed by the mapped
model name; unknown models produce `null` and a warning, never a guess.

### 10.4 Quality fields

- `gold_sections_recall` and `precision`: injected section ids versus the task's
  `gold_sections` (dynamic-context arms; for `full` both are computed as if all were injected;
  for `native` from the rules Claude Code reports loading in the transcript when available,
  otherwise `null`).
- `violations_remaining`: count of narration or restatement comments in the final diff, labeled
  by hand in a `labels/<run-id>.jsonl` file the reporter reads. Never computed by Jev.
- `flags_raised` and `orchestrator_read_full_diff`: from the hand-back card and from whether
  the parent transcript contains a `git diff` tool call after the Agent tool result.
- `compile`: only with `--compile`.

### 10.5 Reporter

`node bin/jev-report.mjs --run-id <id> [--compare <other-run-id>]` prints one markdown table
per area: arms as columns; rows for median and p90 of input tokens, cache-read tokens, output
tokens, cost, duration, turns; then quality rows; then Jev rows: calls per task, median latency,
total Jev cost. A final section lists excluded runs (truncated, failed, `ok: false`) with reasons.
`--compare` puts two runs side by side, for the DeepSeek versus Claude calibration.

### 10.6 Accuracy

`node bin/jev-accuracy.mjs --area <a> [--mode replay|live]` runs `fixtures/<area>/cases.jsonl`,
each `{ state, expected: { [question]: true|false|option } }`, and prints agreement, per-question
precision and recall at the current thresholds, and a calibration table by confidence bucket
(0.5 to 0.6, … 0.9 to 1.0) showing the observed accuracy in each. Initial fixture sizes: 40
comments, 25 summaries, 30 briefs, 20 prompts against the 10 sections.

## 11. Portability and security

- `jev.config.json` (ignored): `allowedRoots`, `mode`, `model`, `timeoutMs`, `maxStateTokens`,
  `contextBudgetTokens`, `logDir`, `providers: { <name>: { baseUrl, models:
  { opus, sonnet, haiku, subagent }, pricing: { <model>: { input, output, cache_read,
  cache_write } } } }`, `activeProvider`.
- `TYPESAFE_API_KEY` from the environment only. `.env` is ignored; `.env.example` is committed.
- `jev-smoke.mjs`: sends `{ model, state: "The sky is blue.", questions: { sky: noul(...),
  color: choice(...), certainty: score(...) } }`, validates all three answer shapes, prints the
  raw body and the `usage` block if present, exits 0 or 2 with a block titled `PASTE THIS BACK`.
- `guard.mjs` refuses any `cwd` outside `allowedRoots`. The WorkApp path is never added.
- Logs, recordings that were made in `live` mode on the personal device, and results are
  committed only from the personal device and only after the user has looked at them.
- No `npm install` is ever run. `package.json` has no `dependencies` or `devDependencies`.
  `npm test` runs `node --test test/`.

## 12. RUNBOOK.md contents

Written for the personal device, no chat context assumed:

1. Prerequisites: Node 20+, Claude Code installed, DeepSeek or Qwen key, TypeSafe key, `git`.
2. Clone both repos; copy `jev.config.example.json` to `jev.config.json`; fill `allowedRoots`
   with the local WebSocket Inspector path (the toolkit path is derived from its own location); fill provider block; export keys.
3. `node bin/jev-smoke.mjs` and what a pass looks like; what to paste back on failure.
4. `node bin/jev-accuracy.mjs --area all --mode live` once, then commit the recordings.
5. Confirm the baseline tag exists in the target; explicit note that the runner resets the
   target working tree.
6. Per area, the exact command pairs, for example:
   `jev-bench --area dynamic-context --arm full --tasks all --reps 1 --run-id <id>` then the
   same with `--arm jev` and `--arm native`; comment-policy `none`, `llm`, `jev`; handback
   `always`, `jev` on subagent tasks only; router `jev-accuracy --area model-router`.
7. Start with `--reps 1` to verify the pipeline, then `--reps 3`.
8. Hand-labeling step for `violations_remaining`: open each comment-policy diff, fill
   `labels/<run-id>.jsonl`.
9. `jev-report --run-id <id>`; commit `results/<run-id>/` and `labels/`; push.
10. Optional Claude calibration: same commands with `--provider anthropic --tasks <5 ids>
    --reps 1 --run-id <id>-claude`, then `jev-report --compare`.

## 13. Testing strategy

All tests run with `node --test` in `replay` mode; no network, no key.

- `client`: timeout and retry behaviour with a fake `fetch`; fail-open result shape; truncation
  flag; guard refusal; schema validation on malformed bodies.
- `comments.extract`: comments inside strings ignored; KDoc detected; `code_after` capture;
  filters for banners, commented-out code, markers.
- `handback facts`: temp git repo fixtures for changed, test, untracked, and mentioned-not-in-diff
  cases.
- `dynamic-context`: selection ordering, token budget cut, session dedupe.
- `hooks/io`: every adapter given a recorded stdin produces the exact JSON contract for its
  event, and produces allow with no output when `JEV_DISABLE=1`.
- `bench/pricing`: cost from usage for a known table; `null` for unknown models.
- `bench/results`: result file matches the schema in 10.3.

## 14. Delivery order

1. Client, schema, recorder, guard, log, config loading, smoke command.
2. comment-policy adapter with fixtures and accuracy script.
3. WebSocket Inspector init, CLAUDE.md sections, install command, arms.
4. dynamic-context adapter.
5. handback-check adapter.
6. model-router CLI and skill.
7. Bench runner, pricing, results, reporter, tasks.
8. RUNBOOK.md, push both repos.

Each step ends with `node --test` green and a commit.
