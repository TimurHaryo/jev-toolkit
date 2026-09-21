# JEV Toolkit Plan 2: Target Setup and the Three Remaining Adapters

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the WebSocket Inspector into a git-tracked benchmark target with a WorkApp-shaped CLAUDE.md split into rule sections, add an install command that writes a target's hook settings and CLAUDE.md variant per arm, and ship the dynamic-context, hand-back, and model-router adapters with fixtures.

**Architecture:** Rules live as Markdown files with a small frontmatter (`id`, `summary`, `paths`, `always`) under `targets/<name>/rules/`; one renderer produces the three CLAUDE.md variants (`full`, `stub`, `native`) from them, and `jev-install` copies the right combination into a target's `.claude/`. Each new adapter follows the plan-1 shape: a question module in `src/questions/`, pure helpers in `src/adapters/<area>/`, a thin `run<Area>(input, opts)` entry that never throws, and a bin that reads stdin and sets `process.exitCode`. Hand-back uses a SubagentStart hook to snapshot the working tree so the SubagentStop hook can attribute changes to that subagent exactly.

**Tech Stack:** Node 20+ ES modules, built-in `fetch`, `node:test`, `node:child_process` for git. No npm packages.

**Spec:** `docs/superpowers/specs/2026-09-21-jev-toolkit-design.md` (sections 7.2 to 7.4, 8.2 to 8.4, 9, 11). Plan 1 delivered the client and comment-policy adapter this plan builds on.

## Global Constraints

- Never write under `<work checkout>/` or `<work checkout copy>/`. The only Android project this plan modifies is `~/Project/WebSocket Inspector` (note the space; always quote the path).
- Task 1 is the only task that touches the WebSocket Inspector, and it changes no Kotlin, Gradle, or proto file there: it adds `.gitignore`, initialises git, commits, tags, and pushes.
- No `npm install`. `package.json` keeps no `dependencies` or `devDependencies`.
- `TYPESAFE_API_KEY` exists only in the environment and not on this machine. Tests inject a fake `fetch`.
- Every hook entry never throws and exits 0. Every adapter checks `config.disabled`, then `config.configMissing || !isAllowedRoot(cwd, config.allowedRoots)` (logging a `skipped` line best-effort), before doing any work.
- Hook contracts (Claude Code docs): UserPromptSubmit stdin carries `user_prompt`; context is added with `{ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } }`. SubagentStart stdin carries `agent_id`, `agent_type`. SubagentStop stdin carries `agent_id`, `agent_type`, `last_assistant_message`, `exit_reason`, `tool_calls_count`, `duration_ms`; CORRECTED after execution (verified against the 2.1.278 binary): SubagentStop `additionalContext` is delivered to the subagent and makes it continue; it never reaches the parent. The hand-back check runs as PreToolUse and PostToolUse hooks matched on the `Agent` tool instead, keyed by `tool_use_id`, with the card in PostToolUse `additionalContext`. The model router stays a CLI plus a skill.
- Thresholds (spec 7.2 to 7.4): dynamic-context relevance 0.50, always inject `core`, budget `config.contextBudgetTokens` (6000). Hand-back claims 0.80, blocker 0.50. Router confidence floor 0.60.
- Question ids: dynamic-context `relevant_<sectionId>`; hand-back `claims_tests_run`, `claims_tests_pass`, `claims_build_ok`, `claims_tests_added`, `claims_complete`, `reports_blocker`; router `tier`, `needs_broad_exploration`, `asks_for_change`.
- No WorkApp text anywhere: rules, fixtures, tasks, skill.
- Commits as `timurharyo00@gmail.com` (already set in the toolkit repo; set explicitly in the target repo). Conventional prefixes. Test command: bare `node --test` from the toolkit root.

---

## Existing interfaces this plan consumes (from plan 1, as implemented)

- `src/client/config.mjs`: `DEFAULTS`, `toolkitRoot()`, `loadConfig({ env?, configPath? })` → `{ mode, model, baseUrl, timeoutMs, maxStateTokens, contextBudgetTokens, logDir, recordingsDir, allowedRoots, apiKey, disabled, configMissing, configInvalid }`. Never throws. `allowedRoots` are absolute (tilde expanded, relative dropped).
- `src/client/guard.mjs`: `isAllowedRoot(cwd, roots)`.
- `src/client/log.mjs`: `appendLog(logDir, area, entry)`.
- `src/client/jev-client.mjs`: `decide(area, state, { cwd, sessionId, config, fetchImpl, loadArea })` → `{ ok: true, answers, meta }` or `{ ok: false, reason, detail? }`. Never throws.
- `src/client/schema.mjs`: `noul(instructions, criteria)`, `choice(instructions, criteria)`.
- `src/client/tokens.mjs`: `estimateTokens(value)`.
- `src/hooks/io.mjs`: `readStdinJson()`, `writeHookOutput(obj)`, `EXIT`.
- Area module contract: `export const version, thresholds; export function buildQuestions(state); export function truncate(state)`.
- Adapter pattern to copy: `src/adapters/comment-policy/hook.mjs` (`runCommentPolicy(input, opts)`, `skipLog`, `ALLOW`), bin `bin/jev-hook-comment-policy.mjs` (reads stdin, calls run, writes output, sets `process.exitCode`).
- `bin/jev-accuracy.mjs --area <a> --mode <m>` runs `fixtures/<a>/cases.jsonl` (`{ state, expected }` per line) through `decide`; booleans compare to `noul >= 0.5`, strings to `choice`.

## File structure

```
targets/websocket-inspector/
  rules/00-core.md … 10-git.md      eleven rule sections with frontmatter
  arms/*.json                        arm definitions (CLAUDE.md variant + rules mode + hooks)
src/targets/frontmatter.mjs          parseFrontmatter
src/targets/rules.mjs                loadRules
src/targets/claude-md.mjs            renderClaudeMd
src/targets/install.mjs              installArm, renderHooks
bin/jev-install.mjs
src/questions/dynamic-context.mjs
src/adapters/dynamic-context/sections.mjs      selectSections, renderContext
src/adapters/dynamic-context/session-state.mjs readInjected, markInjected
src/adapters/dynamic-context/hook.mjs          runDynamicContext
bin/jev-hook-dynamic-context.mjs
src/questions/handback-check.mjs
src/adapters/handback-check/git.mjs            runGit, isGitRepo
src/adapters/handback-check/snapshot.mjs       takeSnapshot, diffSnapshots
src/adapters/handback-check/facts.mjs          collectFacts, mentionedNotInDiff
src/adapters/handback-check/card.mjs           flagsFor, renderCard
src/adapters/handback-check/start-hook.mjs     runSubagentStart
src/adapters/handback-check/hook.mjs           runHandbackCheck
bin/jev-hook-subagent-start.mjs
bin/jev-hook-handback.mjs
src/questions/model-router.mjs
src/adapters/model-router/route.mjs            route
bin/jev-route.mjs
skills/model-router/SKILL.md
fixtures/dynamic-context/cases.jsonl (20)
fixtures/handback-check/cases.jsonl (25)
fixtures/model-router/cases.jsonl (30)
test/*.test.mjs                                one per module
```

---

### Task 1: WebSocket Inspector becomes a git-tracked target

**Files:**
- Create (in the target, `~/Project/WebSocket Inspector`): `.gitignore`
- No other file in the target changes.

**Interfaces:**
- Produces: a git repo on `main`, baseline commit, tag `jev-baseline`, remote `origin` = private GitHub repo `TimurHaryo/websocket-inspector`, pushed with tags.

- [ ] **Step 1: Inspect what would be committed**

```bash
cd "~/Project/WebSocket Inspector"
ls -a
find . -name "*.jks" -o -name "*.keystore" -o -name ".env*" -o -name "google-services.json" -o -name "*.p12" | grep -v '/build/' || echo "no secrets found"
```
Expected: `local.properties`, `.idea/`, `.gradle/`, `.DS_Store` present; the find prints `no secrets found`. If it prints any file, stop and report BLOCKED.

- [ ] **Step 2: Write `.gitignore`**

```
# Gradle
.gradle/
build/
*/build/
.kotlin/

# IDE
.idea/
*.iml
captures/
.externalNativeBuild/
.cxx/

# Local machine
local.properties
.DS_Store

# JEV writes these per benchmark arm; the baseline has none
CLAUDE.md
.claude/
```

Note: `CLAUDE.md` and `.claude/` are ignored on purpose. The benchmark runner resets the target to `jev-baseline` and the install command rewrites them per arm; they must never become part of the baseline.

- [ ] **Step 3: Initialise, commit, tag**

```bash
cd "~/Project/WebSocket Inspector"
git init -q -b main
git config user.email "timurharyo00@gmail.com"
git config user.name "Timur Haryo"
git add -A
git status --short | grep -E 'local.properties|\.idea/|\.gradle/|\.DS_Store' && echo "IGNORE FAILED" || echo "ignore ok"
git commit -q -m "chore: baseline for JEV benchmark"
git tag jev-baseline
git log --oneline
git show --stat HEAD | tail -5
```
Expected: `ignore ok`, one commit, tag present. The stat should list only `.gitignore`, `build.gradle.kts`, `settings.gradle.kts`, `gradle.properties`, `gradlew`, `gradlew.bat`, `gradle/`, `app/`, `inspector/`, `example/`.

- [ ] **Step 4: Create the private remote and push**

```bash
cd "~/Project/WebSocket Inspector"
gh repo create websocket-inspector --private --source . --remote origin --push --description "Personal Compose playground; benchmark target for the JEV toolkit"
git push --tags
gh repo view TimurHaryo/websocket-inspector --json visibility -q .visibility
git ls-remote --tags origin | grep jev-baseline
```
Expected: `PRIVATE`, and the tag listed on the remote.

- [ ] **Step 5: Record in the toolkit**

In the toolkit repo, append to `jev.config.example.json`'s `allowedRoots` example nothing (it already shows a placeholder path). Instead add to `README.md` under "Setup on a device that has a TypeSafe key" a line: `git clone https://github.com/TimurHaryo/websocket-inspector.git` and `# add its absolute path to allowedRoots`. Commit in the toolkit:

```bash
cd ~/Project/JEV
git add README.md
git commit -m "docs: point setup at the websocket-inspector target repo"
```

---

### Task 2: Rule sections, frontmatter parser, rules loader, CLAUDE.md renderer

**Files:**
- Create: `targets/websocket-inspector/rules/00-core.md` … `10-git.md` (eleven files)
- Create: `src/targets/frontmatter.mjs`, `src/targets/rules.mjs`, `src/targets/claude-md.mjs`
- Test: `test/frontmatter.test.mjs`, `test/rules.test.mjs`, `test/claude-md.test.mjs`

**Interfaces:**
- `parseFrontmatter(text): { meta: { id: string, summary: string, paths: string[], always: boolean }, body: string }`. Throws `Error('frontmatter: missing id')` when `id` is absent; missing `summary` → `''`; missing `paths` → `[]`; missing `always` → `false`.
- `loadRules(dir): Promise<Rule[]>` where `Rule = { id, summary, paths, always, body, file }`, sorted by filename. Ignores non-`.md` files.
- `renderClaudeMd(variant, rules): string` for `variant` in `'full' | 'stub' | 'native'`.
  - `full`: core body, then a blank line, then one `@.claude/jev-rules/<file>` import line per non-core rule.
  - `stub`: core body, then the line `Project rules are injected per task by the JEV dynamic-context hook; do not look for them here.`
  - `native`: core body only (rules are installed into `.claude/rules/` with `paths`).
- Frontmatter format (exact):
```
---
id: compose
summary: Compose rules for the inspector UI: theme tokens, previews, list layout, state hoisting
paths:
  - "**/ui/**/*.kt"
always: false
---
```

- [ ] **Step 1: Write the eleven rule files**

`targets/websocket-inspector/rules/00-core.md`:
```markdown
---
id: core
summary: Project overview, module map, build and test commands
always: true
---
# WebSocket Inspector

A personal Compose playground: a sample app (`:app`) that opens two Scarlet WebSocket clients
against one endpoint, and a reusable inspector library (`:inspector`) that decorates Scarlet's
WebSocket to record every frame into Room and shows them in a Compose UI launched from a
persistent notification. Kotlin 1.9.22, AGP 8.6.0, minSdk 23, compileSdk 36. No DI framework.

## Modules

| Module | Namespace | Purpose |
|---|---|---|
| `:app` | `com.example.websocketinspector` | Sample host: `MainActivity` wires two Scarlet clients, `WebSocketFinancialApi` (Flow), `FlowStreamAdapter`, protobuf messages under `app/src/main/proto` |
| `:inspector` | `com.tinder.scarlet.inspector` (code in `com.murphy.scarlet.inspector`) | Library: `ChuckerWebSocketFactory` and `ChuckerScarletWebSocket` decorators, `ScarletInspector` entry point, `internal/` service, notification, Room, Compose screens |

Public surface of `:inspector` is the four top-level files; everything under `internal/` is
implementation and may change freely.

## Build and test

    ./gradlew :app:assembleDebug
    ./gradlew :inspector:compileDebugKotlin        # fastest compile check
    ./gradlew :inspector:testDebugUnitTest         # unit tests (none exist yet; add under src/test)
    ./gradlew :inspector:connectedDebugAndroidTest # Room DAO tests need a device or emulator

## Working rules that always apply

- Read the file you are about to change in full first.
- Keep `:app` a thin sample; behaviour belongs in `:inspector`.
- Do not add dependencies without saying so in the change summary.
```

`01-architecture.md`:
```markdown
---
id: architecture
summary: Layering between :app and :inspector, public vs internal, where new code goes, manual construction instead of DI
paths:
  - "**/*.kt"
---
# Architecture

- `:app` depends on `:inspector`; never the reverse.
- `:inspector` public API is `ChuckerWebSocketFactory`, `ChuckerScarletWebSocket`, `ScarletInspector`, `InspectorLauncher`. New public types need a one-line KDoc and a reason in the change summary.
- `internal/` holds: `InspectorService` and `InspectorNotificationManager` (Android plumbing), `SessionTracker` (process-lifetime cache), `data/` (Room entities, DAO, database), `ui/compose/` (screens and components).
- There is no DI framework. Construct collaborators in one place and pass them down; do not create `ScarletInspector(context)` inside composables or per screen. New screens take a ViewModel or a repository as a parameter.
- Data flow: Scarlet `WebSocket` events → `ChuckerScarletWebSocket` → `InspectorDao` (Room) → `LiveData`/`Flow` → Compose screen. Do not read Room from a composable directly; go through a ViewModel or a small repository class in `internal/data/`.
- Prefer small files with one type each. Split a file that passes 250 lines.
```

`02-compose.md`:
```markdown
---
id: compose
summary: Compose rules for the inspector UI: theme tokens, previews, list layout, state hoisting
paths:
  - "**/ui/**/*.kt"
---
# Compose

- Colors and typography come from `MaterialTheme.colorScheme` and `MaterialTheme.typography`. Never write `Color.Gray` or a literal `Color(0x…)` in a screen or component; `SocketFrameItemComponent` has one such literal to fix when touched.
- Every new composable ships two previews: `@Preview(name = "light")` and `@Preview(name = "dark", uiMode = UI_MODE_NIGHT_YES)`, wrapped in `MaterialTheme`.
- `LazyColumn` never sits inside a vertically scrollable parent. Inside a `Column`, give it `Modifier.weight(1f)`. Always pass a stable `key` to `items`.
- Hoist state: a screen receives state and callbacks; it does not create repositories or launch coroutines on `Dispatchers.IO` itself. Existing screens do this for MVP parity; do not copy the pattern into new screens.
- Navigation routes are string constants in `InspectorComposeActivity`; add new routes there and pass arguments through the route, not through singletons.
- `textAlign` on `Text` needs a width larger than the content; use `fillMaxWidth()` or align the parent.
```

`03-coroutines.md`:
```markdown
---
id: coroutines
summary: Coroutine and Flow rules: scopes, dispatchers, no runBlocking on callback threads, Flow adapters
paths:
  - "**/inspector/*.kt"
  - "**/internal/*.kt"
  - "**/app/src/**/*.kt"
---
# Coroutines and Flow

- Database writes go through `ScarletInspector.ioScope` (SupervisorJob + Dispatchers.IO). Do not create ad hoc `CoroutineScope(Dispatchers.IO)` in screens or decorators.
- Never call `runBlocking` on a Scarlet callback thread. `ChuckerScarletWebSocket.createSession` does this today; when you touch it, make the DB lookup suspend and call it from `ioScope`.
- Dispatchers are constructor parameters with defaults (`io: CoroutineDispatcher = Dispatchers.IO`) so tests can inject `StandardTestDispatcher`.
- Scarlet streams are exposed as `Flow` through `FlowStreamAdapter`; new APIs return `Flow<T>`, not `ReceiveChannel` (the `EchoService` channel example is legacy).
- Cancel scopes you own. `MainActivity` creates a `Dispatchers.Main + Job()` scope and never cancels it; fix when touched.
- Catch specific exceptions at the boundary (`SQLiteConstraintException` in frame logging), log them with the frame id, and never swallow silently.
```

`04-websocket.md`:
```markdown
---
id: websocket
summary: Scarlet decorator design, frame model, session reuse, protobuf adapters, what to update when frame logging changes
paths:
  - "**/Chucker*.kt"
  - "**/SessionTracker.kt"
  - "**/*Api.kt"
  - "**/*StreamAdapter.kt"
---
# WebSocket layer

- `ChuckerWebSocketFactory` wraps the delegate factory only in debug builds; `ChuckerScarletWebSocket` intercepts `open`, `send`, and `close` and records frames. Keep the decorator transparent: every delegate call happens exactly once, in the same order, with the same arguments.
- Frames are `SocketFrame(sessionId, direction, type, payload, timestamp)`. Text frames store the string; binary frames store base64 via `okio.ByteString`. Do not decode protobuf for display in the inspector; the sample app owns protobuf.
- Session reuse: `SessionTracker` keeps `type → sessionId` for the process lifetime so reconnects stay in one session. The lookup order is memory cache, then DB, then create. Keep that order.
- Frame logging must survive a cleared session: on `SQLiteConstraintException` recreate the session once and retry once; then log and drop.
- The sample app's two clients (`Financial`, `Trading`) share one `OkHttpClient`. Do not create a second `OkHttpClient`; do not call `setupScarlet()` twice without tearing the first instance down.
- Protobuf classes are generated from `app/src/main/proto`; the copies in `example/` are not on the build path.
```

`05-room.md`:
```markdown
---
id: room
summary: Room entities, DAO conventions, migrations, and the current destructive-migration caveat
paths:
  - "**/data/**/*.kt"
---
# Room

- Entities: `SocketSession` (id, type, createdAt) and `SocketFrame` (foreign key to session, `Direction`, `Type`, payload, timestamp). Enums are stored by name through type converters.
- `InspectorDatabase` is at version 2 with `fallbackToDestructiveMigration()` and `exportSchema = false`. Any schema change bumps the version and adds a real `Migration`; do not rely on the destructive fallback for a new column.
- DAO queries that feed the UI return `LiveData` today; new queries return `Flow` and are converted with `collectAsState()` in the screen.
- Inserts run on `ioScope`, never on the caller's thread. Batch frame inserts when more than ten arrive within a second.
- Tests for the DAO use `Room.inMemoryDatabaseBuilder` under `androidTest`.
```

`06-testing.md`:
```markdown
---
id: testing
summary: Test layout, naming, what to test per layer, and the libraries actually declared
paths:
  - "**/src/test/**"
  - "**/src/androidTest/**"
---
# Testing

- Unit tests live under `src/test/kotlin` mirroring the main package. Instrumented tests under `src/androidTest/kotlin`.
- Declared libraries: JUnit 4, `androidx.test.ext:junit`, Espresso, Compose `ui-test-junit4` for `:inspector`. Adding MockK or `kotlinx-coroutines-test` is allowed but must be stated in the change summary.
- Test names read `subject_condition_expectation`, for example `createSession_existingTypeInCache_reusesSessionId`.
- Test the decorator by wrapping a fake `WebSocket` and asserting delegate calls and recorded frames; test `FlowStreamAdapter` with a fake `Stream`; test the DAO in memory; test composables with `createComposeRule` and semantics, not screenshots.
- Every bug fix adds the test that would have caught it.
```

`07-comments.md`:
```markdown
---
id: comments
summary: Comment policy: explain why, never what; what is allowed and what is denied
paths:
  - "**/*.kt"
---
# Comments

Default to no comment. Names carry the meaning.

Write a comment only for: a public type's one-line purpose (KDoc); a public function whose purpose is not obvious from its signature (one line on why or what it returns); a genuinely non-obvious block (the reason: workaround, ordering constraint, platform quirk, race, deliberate deviation); an intentionally empty block.

Never write: narration of the next line (`// increment counter`), restatement of the signature in KDoc, section banners, step numbering, commented-out code, or thinking-aloud notes about what the compiler might say. The inspector's decorator has several of the last kind; delete them when you touch that file.
```

`08-naming.md`:
```markdown
---
id: naming
summary: File, class, composable, Room, and resource naming
paths:
  - "**/*.kt"
  - "**/res/**"
---
# Naming

- One top-level type per file, file named after the type.
- Composables: `PascalCase` nouns for screens (`SocketListScreen`) and components (`SocketFrameItemComponent`); `on<Event>` for callbacks; `<Name>State` for hoisted state classes.
- Room: entities are nouns (`SocketFrame`), DAO is `InspectorDao`, queries read `get<Thing>By<Key>`, mutations `insert<Thing>` / `delete<Thing>`.
- Decorators keep the delegate's name plus a prefix (`ChuckerScarletWebSocket` wraps a Scarlet `WebSocket`).
- Resources: `ic_` icons, `notification_` channels and ids as constants in the notification manager, string keys section-prefixed (`inspector_title_sessions`).
- Constants `UPPER_SNAKE_CASE` in a `companion object` or top-level `private const val`.
```

`09-gotchas.md`:
```markdown
---
id: gotchas
summary: Known symptom, cause, fix table for this project
paths:
  - "**/*.kt"
---
# Gotchas

| Symptom | Cause | Fix |
|---|---|---|
| App stalls or ANR when a socket opens | `runBlocking` inside `createSession` on Scarlet's callback thread | make the lookup `suspend`, call from `ioScope` |
| `SQLiteConstraintException: FOREIGN KEY constraint failed` while logging frames | session rows cleared while the socket is open | recreate the session once, retry once, then drop and log |
| Duplicate frames after pressing Connect again | `setupScarlet()` builds new Scarlet instances without closing the old ones | keep one instance per type; tear down before rebuilding |
| Coroutines keep running after the sample activity closes | `MainActivity` scope is never cancelled | cancel in `onDestroy` |
| All recorded frames vanish after an update | `fallbackToDestructiveMigration()` at a version bump | write a `Migration` |
| Protobuf edits have no effect | edited the copies in `example/`, not `app/src/main/proto` | edit under `app/src/main/proto` |
| Compose preview renders no theme | screen not wrapped in `MaterialTheme` in the preview | wrap it |
```

`10-git.md`:
```markdown
---
id: git
summary: Commit message format and branch naming
paths: []
---
# Git

- Commit subject: `<type>: <description>` with type in feat, fix, refactor, docs, test, chore, perf.
- Branches: `task/<short-slug>`.
- One logical change per commit; run the compile check before committing.
```

- [ ] **Step 2: Write the failing tests**

`test/frontmatter.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../src/targets/frontmatter.mjs';

const doc = `---
id: compose
summary: Compose rules: theme tokens, previews
paths:
  - "**/ui/**/*.kt"
  - "**/*Screen.kt"
always: false
---
# Compose

Body line.
`;

test('parses id, summary, paths, always, and body', () => {
  const { meta, body } = parseFrontmatter(doc);
  assert.deepEqual(meta, { id: 'compose', summary: 'Compose rules: theme tokens, previews', paths: ['**/ui/**/*.kt', '**/*Screen.kt'], always: false });
  assert.equal(body, '# Compose\n\nBody line.\n');
});

test('defaults: no summary, no paths, no always; empty paths list', () => {
  const { meta } = parseFrontmatter('---\nid: x\n---\nbody');
  assert.deepEqual(meta, { id: 'x', summary: '', paths: [], always: false });
  assert.deepEqual(parseFrontmatter('---\nid: y\npaths: []\n---\n').meta.paths, []);
  assert.equal(parseFrontmatter('---\nid: y\nalways: true\n---\n').meta.always, true);
});

test('missing id throws; missing frontmatter block throws', () => {
  assert.throws(() => parseFrontmatter('---\nsummary: s\n---\n'), /missing id/);
  assert.throws(() => parseFrontmatter('# no frontmatter'), /frontmatter/);
});
```

`test/rules.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRules } from '../src/targets/rules.mjs';
import { toolkitRoot } from '../src/client/config.mjs';

test('loads .md files in filename order and ignores others', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jevrules-'));
  await writeFile(join(dir, '10-b.md'), '---\nid: b\nsummary: B\n---\nbody b');
  await writeFile(join(dir, '00-a.md'), '---\nid: a\nalways: true\n---\nbody a');
  await writeFile(join(dir, 'notes.txt'), 'ignored');
  const rules = await loadRules(dir);
  assert.deepEqual(rules.map((r) => r.id), ['a', 'b']);
  assert.equal(rules[0].always, true);
  assert.equal(rules[1].body, 'body b');
  assert.equal(rules[1].file, '10-b.md');
});

test('the shipped websocket-inspector rules load with exactly one always-on core section and unique ids', async () => {
  const rules = await loadRules(join(toolkitRoot(), 'targets', 'websocket-inspector', 'rules'));
  assert.equal(rules.length, 11);
  assert.deepEqual(rules.filter((r) => r.always).map((r) => r.id), ['core']);
  assert.equal(new Set(rules.map((r) => r.id)).size, 11);
  for (const r of rules) {
    assert.ok(r.summary.length > 10 || r.always, `${r.id} needs a summary`);
    assert.equal(/workapp/i.test(r.body + r.summary), false, `${r.id} mentions WorkApp`);
  }
  assert.deepEqual(rules.find((r) => r.id === 'git').paths, []);
});
```

`test/claude-md.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderClaudeMd } from '../src/targets/claude-md.mjs';

const rules = [
  { id: 'core', summary: '', paths: [], always: true, body: '# Core\n\ncore body\n', file: '00-core.md' },
  { id: 'compose', summary: 'C', paths: ['**/ui/**'], always: false, body: '# Compose\n', file: '02-compose.md' },
  { id: 'git', summary: 'G', paths: [], always: false, body: '# Git\n', file: '10-git.md' },
];

test('full: core body then one import per non-core rule', () => {
  const out = renderClaudeMd('full', rules);
  assert.ok(out.startsWith('# Core\n\ncore body\n'));
  assert.match(out, /\n@\.claude\/jev-rules\/02-compose\.md\n/);
  assert.match(out, /\n@\.claude\/jev-rules\/10-git\.md\n/);
  assert.doesNotMatch(out, /00-core/);
});

test('stub: core body then the injection notice, no imports', () => {
  const out = renderClaudeMd('stub', rules);
  assert.match(out, /injected per task by the JEV dynamic-context hook/);
  assert.doesNotMatch(out, /@\.claude/);
});

test('native: core body only', () => {
  assert.equal(renderClaudeMd('native', rules), '# Core\n\ncore body\n');
});

test('unknown variant throws; missing core throws', () => {
  assert.throws(() => renderClaudeMd('bogus', rules), /variant/);
  assert.throws(() => renderClaudeMd('full', rules.slice(1)), /core/);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test test/frontmatter.test.mjs test/rules.test.mjs test/claude-md.test.mjs`
Expected: FAIL, modules not found.

- [ ] **Step 4: Write the implementations**

`src/targets/frontmatter.mjs`:
```js
const FENCE = '---';

function parseValue(raw) {
  const v = raw.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === '[]') return [];
  return v.replace(/^"(.*)"$/, '$1');
}

/** Parses the small YAML subset used by rule files: scalars and a list of quoted strings. */
export function parseFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0].trim() !== FENCE) throw new Error('frontmatter: document must start with ---');
  const end = lines.indexOf(FENCE, 1);
  if (end === -1) throw new Error('frontmatter: unterminated block');
  const meta = { id: undefined, summary: '', paths: [], always: false };
  let listKey = null;
  for (const line of lines.slice(1, end)) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) { meta[listKey].push(parseValue(item[1])); continue; }
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, raw] = kv;
    if (raw.trim() === '') { listKey = key; meta[key] = []; continue; }
    listKey = null;
    meta[key] = parseValue(raw);
  }
  if (!meta.id) throw new Error('frontmatter: missing id');
  return { meta: { id: meta.id, summary: meta.summary ?? '', paths: meta.paths ?? [], always: meta.always === true }, body: lines.slice(end + 1).join('\n') };
}
```

`src/targets/rules.mjs`:
```js
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';

/** Reads every rule section in a folder, in filename order. */
export async function loadRules(dir) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
  const rules = [];
  for (const file of files) {
    const { meta, body } = parseFrontmatter(await readFile(join(dir, file), 'utf8'));
    rules.push({ ...meta, body, file });
  }
  return rules;
}
```

`src/targets/claude-md.mjs`:
```js
const STUB_NOTICE = 'Project rules are injected per task by the JEV dynamic-context hook; do not look for them here.';

/** Builds the CLAUDE.md text for one benchmark arm from the loaded rule sections. */
export function renderClaudeMd(variant, rules) {
  const core = rules.find((r) => r.always);
  if (!core) throw new Error('renderClaudeMd: no always-on core section');
  const others = rules.filter((r) => !r.always);
  if (variant === 'native') return core.body;
  if (variant === 'stub') return `${core.body}\n${STUB_NOTICE}\n`;
  if (variant === 'full') return `${core.body}\n${others.map((r) => `@.claude/jev-rules/${r.file}`).join('\n')}\n`;
  throw new Error(`renderClaudeMd: unknown variant ${variant}`);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/frontmatter.test.mjs test/rules.test.mjs test/claude-md.test.mjs`
Expected: 9 passing. If the `git` rule's `paths: []` parses as a string, check `parseValue` handles `[]` before the quote strip.

- [ ] **Step 6: Commit**

```bash
git add targets/websocket-inspector/rules src/targets/frontmatter.mjs src/targets/rules.mjs src/targets/claude-md.mjs test/frontmatter.test.mjs test/rules.test.mjs test/claude-md.test.mjs
git commit -m "feat: websocket-inspector rule sections, frontmatter parser, CLAUDE.md renderer"
```

---

### Task 3: Arms and the install command

**Files:**
- Create: `targets/websocket-inspector/arms/base-full.json`, `comment-policy-jev.json`, `dynamic-context-full.json`, `dynamic-context-jev.json`, `dynamic-context-native.json`, `handback-jev.json`, `all-jev.json`
- Create: `src/targets/install.mjs`, `bin/jev-install.mjs`
- Test: `test/install.test.mjs`

**Interfaces:**
- Arm file shape:
```json
{
  "claudeMd": "full",
  "rules": "jev",
  "hooks": {
    "PreToolUse": [{ "matcher": "Edit|Write|MultiEdit", "bin": "jev-hook-comment-policy.mjs", "timeout": 10, "statusMessage": "JEV comment policy" }]
  }
}
```
  `claudeMd` ∈ `full|stub|native`; `rules` ∈ `jev` (copy all non-core rules into `.claude/jev-rules/`), `native` (copy non-core rules with non-empty `paths` into `.claude/rules/`, frontmatter reduced to `paths` only), `none`.
- `renderHooks(hooks, toolkitPath): object` → Claude Code `hooks` value: for each event, `[{ matcher?, hooks: [{ type: 'command', command: 'node "<toolkitPath>/bin/<bin>"', timeout, statusMessage? }] }]`. Entries without `matcher` omit the key.
- `installArm({ targetDir, armFile, rulesDir, toolkitPath }): Promise<{ written: string[], removed: string[] }>`. Writes `<target>/CLAUDE.md`, `<target>/.claude/settings.json` (existing non-`hooks` keys preserved; `hooks` replaced), and the rules folder; removes a previously JEV-managed rules folder of the other kind (identified by a `.jev-managed` marker file inside it). Idempotent.
- Bin: `node bin/jev-install.mjs --target <dir> --arm <name> [--target-name websocket-inspector]`. Exits 3 with a message when `--target` is not under `allowedRoots` or config is missing; exits 1 on usage error; prints the written file list.

- [ ] **Step 1: Write the arm files**

`base-full.json`: `{ "claudeMd": "full", "rules": "jev", "hooks": {} }`
`comment-policy-jev.json`: `{ "claudeMd": "full", "rules": "jev", "hooks": { "PreToolUse": [{ "matcher": "Edit|Write|MultiEdit", "bin": "jev-hook-comment-policy.mjs", "timeout": 10, "statusMessage": "JEV comment policy" }] } }`
`dynamic-context-full.json`: `{ "claudeMd": "full", "rules": "jev", "hooks": {} }`
`dynamic-context-jev.json`: `{ "claudeMd": "stub", "rules": "jev", "hooks": { "UserPromptSubmit": [{ "bin": "jev-hook-dynamic-context.mjs", "timeout": 10, "statusMessage": "JEV selecting rules" }] } }`
`dynamic-context-native.json`: `{ "claudeMd": "native", "rules": "native", "hooks": {} }`
`handback-jev.json`: `{ "claudeMd": "full", "rules": "jev", "hooks": { "SubagentStart": [{ "matcher": ".*", "bin": "jev-hook-subagent-start.mjs", "timeout": 10 }], "SubagentStop": [{ "matcher": ".*", "bin": "jev-hook-handback.mjs", "timeout": 15, "statusMessage": "JEV hand-back check" }] } }`
`all-jev.json`: stub CLAUDE.md, rules `jev`, and all four hook entries above combined.

- [ ] **Step 2: Write the failing test**

`test/install.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderHooks, installArm } from '../src/targets/install.mjs';
import { toolkitRoot } from '../src/client/config.mjs';

const RULES = join(toolkitRoot(), 'targets', 'websocket-inspector', 'rules');
const ARMS = join(toolkitRoot(), 'targets', 'websocket-inspector', 'arms');

test('renderHooks builds the Claude Code shape and quotes the toolkit path', () => {
  const out = renderHooks({ PreToolUse: [{ matcher: 'Edit|Write', bin: 'x.mjs', timeout: 5, statusMessage: 's' }], UserPromptSubmit: [{ bin: 'y.mjs', timeout: 7 }] }, '/tk');
  assert.deepEqual(out, {
    PreToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'node "/tk/bin/x.mjs"', timeout: 5, statusMessage: 's' }] }],
    UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node "/tk/bin/y.mjs"', timeout: 7 }] }],
  });
});

test('installArm writes CLAUDE.md, settings.json, and jev-rules for a jev arm, preserving other settings keys', async () => {
  const target = await mkdtemp(join(tmpdir(), 'jevtarget-'));
  await mkdir(join(target, '.claude'));
  await writeFile(join(target, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Read'] }, hooks: { Stop: [] } }));
  const r = await installArm({ targetDir: target, armFile: join(ARMS, 'comment-policy-jev.json'), rulesDir: RULES, toolkitPath: '/tk' });
  const settings = JSON.parse(await readFile(join(target, '.claude', 'settings.json'), 'utf8'));
  assert.deepEqual(settings.permissions, { allow: ['Read'] });
  assert.equal(settings.hooks.Stop, undefined);
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].command, 'node "/tk/bin/jev-hook-comment-policy.mjs"');
  const claude = await readFile(join(target, 'CLAUDE.md'), 'utf8');
  assert.match(claude, /@\.claude\/jev-rules\/02-compose\.md/);
  const files = await readdir(join(target, '.claude', 'jev-rules'));
  assert.equal(files.includes('.jev-managed'), true);
  assert.equal(files.filter((f) => f.endsWith('.md')).length, 10);
  assert.ok(r.written.some((p) => p.endsWith('CLAUDE.md')));
});

test('switching to the native arm removes jev-rules and writes .claude/rules with paths-only frontmatter, skipping empty-paths sections', async () => {
  const target = await mkdtemp(join(tmpdir(), 'jevtarget-'));
  await installArm({ targetDir: target, armFile: join(ARMS, 'dynamic-context-jev.json'), rulesDir: RULES, toolkitPath: '/tk' });
  const r = await installArm({ targetDir: target, armFile: join(ARMS, 'dynamic-context-native.json'), rulesDir: RULES, toolkitPath: '/tk' });
  await assert.rejects(stat(join(target, '.claude', 'jev-rules')));
  assert.ok(r.removed.some((p) => p.endsWith('jev-rules')));
  const files = (await readdir(join(target, '.claude', 'rules'))).filter((f) => f.endsWith('.md'));
  assert.equal(files.includes('10-git.md'), false);
  assert.equal(files.length, 9);
  const compose = await readFile(join(target, '.claude', 'rules', '02-compose.md'), 'utf8');
  assert.match(compose, /^---\npaths:\n  - "\*\*\/ui\/\*\*\/\*\.kt"\n---\n# Compose/);
  assert.doesNotMatch(compose, /summary:/);
  const claude = await readFile(join(target, 'CLAUDE.md'), 'utf8');
  assert.doesNotMatch(claude, /@\.claude/);
  const settings = JSON.parse(await readFile(join(target, '.claude', 'settings.json'), 'utf8'));
  assert.deepEqual(settings.hooks, {});
});

test('installArm is idempotent', async () => {
  const target = await mkdtemp(join(tmpdir(), 'jevtarget-'));
  const a = await installArm({ targetDir: target, armFile: join(ARMS, 'all-jev.json'), rulesDir: RULES, toolkitPath: '/tk' });
  const b = await installArm({ targetDir: target, armFile: join(ARMS, 'all-jev.json'), rulesDir: RULES, toolkitPath: '/tk' });
  assert.deepEqual(a.written.sort(), b.written.sort());
  assert.deepEqual(b.removed, []);
});

test('every shipped arm file is valid', async () => {
  for (const f of (await readdir(ARMS)).filter((x) => x.endsWith('.json'))) {
    const arm = JSON.parse(await readFile(join(ARMS, f), 'utf8'));
    assert.ok(['full', 'stub', 'native'].includes(arm.claudeMd), f);
    assert.ok(['jev', 'native', 'none'].includes(arm.rules), f);
    for (const entries of Object.values(arm.hooks)) for (const e of entries) assert.match(e.bin, /^jev-hook-[a-z-]+\.mjs$/, f);
  }
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/install.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 4: Write the implementation**

`src/targets/install.mjs`:
```js
import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadRules } from './rules.mjs';
import { renderClaudeMd } from './claude-md.mjs';

const MARKER = '.jev-managed';
const FOLDERS = { jev: 'jev-rules', native: 'rules' };

export function renderHooks(hooks, toolkitPath) {
  const out = {};
  for (const [event, entries] of Object.entries(hooks)) {
    out[event] = entries.map((e) => {
      const hook = { type: 'command', command: `node "${toolkitPath}/bin/${e.bin}"`, timeout: e.timeout };
      if (e.statusMessage) hook.statusMessage = e.statusMessage;
      return e.matcher ? { matcher: e.matcher, hooks: [hook] } : { hooks: [hook] };
    });
  }
  return out;
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function readJsonOr(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}

function nativeFrontmatter(rule) {
  return `---\npaths:\n${rule.paths.map((p) => `  - "${p}"`).join('\n')}\n---\n${rule.body}`;
}

async function removeManaged(dir, removed) {
  if (await exists(join(dir, MARKER))) { await rm(dir, { recursive: true, force: true }); removed.push(dir); }
}

async function writeRules(claudeDir, mode, rules, written, removed) {
  for (const [kind, folder] of Object.entries(FOLDERS)) {
    if (kind !== mode) await removeManaged(join(claudeDir, folder), removed);
  }
  if (mode === 'none') return;
  const dir = join(claudeDir, FOLDERS[mode]);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, MARKER), 'written by jev-install; safe to delete\n');
  for (const rule of rules.filter((r) => !r.always)) {
    if (mode === 'native' && rule.paths.length === 0) continue;
    const text = mode === 'native' ? nativeFrontmatter(rule) : await readFile(rule.sourcePath, 'utf8');
    const path = join(dir, rule.file);
    await writeFile(path, text);
    written.push(path);
  }
}

/** Installs one benchmark arm into a target project. JEV owns CLAUDE.md, settings.hooks, and its rules folder. */
export async function installArm({ targetDir, armFile, rulesDir, toolkitPath }) {
  const arm = JSON.parse(await readFile(armFile, 'utf8'));
  const rules = (await loadRules(rulesDir)).map((r) => ({ ...r, sourcePath: join(rulesDir, r.file) }));
  const written = [];
  const removed = [];
  const claudeDir = join(targetDir, '.claude');
  await mkdir(claudeDir, { recursive: true });

  const claudePath = join(targetDir, 'CLAUDE.md');
  await writeFile(claudePath, renderClaudeMd(arm.claudeMd, rules));
  written.push(claudePath);

  const settingsPath = join(claudeDir, 'settings.json');
  const existing = await readJsonOr(settingsPath, {});
  await writeFile(settingsPath, `${JSON.stringify({ ...existing, hooks: renderHooks(arm.hooks, toolkitPath) }, null, 2)}\n`);
  written.push(settingsPath);

  await writeRules(claudeDir, arm.rules, rules, written, removed);
  return { written, removed };
}
```

`bin/jev-install.mjs`:
```js
#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { loadConfig, toolkitRoot } from '../src/client/config.mjs';
import { isAllowedRoot } from '../src/client/guard.mjs';
import { installArm } from '../src/targets/install.mjs';

async function main() {
  const { values } = parseArgs({ options: { target: { type: 'string' }, arm: { type: 'string' }, 'target-name': { type: 'string', default: 'websocket-inspector' } } });
  if (!values.target || !values.arm) {
    console.error('usage: jev-install --target <dir> --arm <name> [--target-name websocket-inspector]');
    return 1;
  }
  const config = loadConfig();
  const targetDir = resolve(values.target);
  if (config.configMissing || !isAllowedRoot(targetDir, config.allowedRoots)) {
    console.error(`refused: ${targetDir} is not under allowedRoots in jev.config.json (or the config is missing)`);
    return 3;
  }
  const base = join(toolkitRoot(), 'targets', values['target-name']);
  const { written, removed } = await installArm({ targetDir, armFile: join(base, 'arms', `${values.arm}.json`), rulesDir: join(base, 'rules'), toolkitPath: toolkitRoot() });
  for (const p of written) console.log(`wrote   ${p}`);
  for (const p of removed) console.log(`removed ${p}`);
  return 0;
}

process.exitCode = await main();
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/install.test.mjs`
Expected: 5 passing. Then `node bin/jev-install.mjs --target /tmp/nope --arm base-full` prints the refusal and exits 3 (no config on this machine).

- [ ] **Step 6: Commit**

```bash
chmod +x bin/jev-install.mjs
git add targets/websocket-inspector/arms src/targets/install.mjs bin/jev-install.mjs test/install.test.mjs
git commit -m "feat: benchmark arms and jev-install command"
```

---

### Task 4: Dynamic-context adapter (UserPromptSubmit)

**Files:**
- Create: `src/questions/dynamic-context.mjs`, `src/adapters/dynamic-context/sections.mjs`, `src/adapters/dynamic-context/session-state.mjs`, `src/adapters/dynamic-context/hook.mjs`, `bin/jev-hook-dynamic-context.mjs`
- Test: `test/questions-dynamic-context.test.mjs`, `test/dynamic-context-sections.test.mjs`, `test/dynamic-context-hook.test.mjs`

**Interfaces:**
- Area module: `version = '1'`, `thresholds = { relevant: 0.5 }`, `MAX_PROMPT_CHARS = 8000`, `buildQuestions(state)` with state `{ prompt: string, sections: [{ id, summary }] }` → one Noul `relevant_<id>` per section; `truncate(state)` cuts `prompt` to `MAX_PROMPT_CHARS`.
- `selectSections({ answers, sections, threshold, budgetTokens, alreadyInjected }): string[]` → ids ordered by probability desc, excluding `alreadyInjected`, cut when the running `estimateTokens(body)` total would exceed `budgetTokens`.
- `renderContext(selected: Rule[]): string` → `Project rules selected for this task (JEV):\n\n` then each rule's `body` separated by a blank line.
- `readInjected(stateDir, sessionId): Promise<Set<string>>`, `markInjected(stateDir, sessionId, ids): Promise<void>`; file `<stateDir>/<sanitized sessionId>.json` holding `{ injected: string[] }`. Corrupt or missing file reads as empty.
- `runDynamicContext(input, opts): Promise<{ output, exitCode }>` with `opts = { config?, fetchImpl?, decideImpl?, loadRulesImpl? }`. Input: `{ session_id, cwd, user_prompt | prompt }`. Output on selection: `{ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } }`; otherwise `null`. Exit code always 0. Rules are read from `<cwd>/.claude/jev-rules` via `loadRules`.

- [ ] **Step 1: Write the failing tests**

`test/questions-dynamic-context.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as area from '../src/questions/dynamic-context.mjs';

const state = { prompt: 'Add a dark preview to SocketListScreen', sections: [{ id: 'compose', summary: 'Compose rules' }, { id: 'room', summary: 'Room rules' }] };

test('contract and one noul per section referencing the summary', () => {
  assert.equal(area.version, '1');
  assert.deepEqual(area.thresholds, { relevant: 0.5 });
  const q = area.buildQuestions(state);
  assert.deepEqual(Object.keys(q), ['relevant_compose', 'relevant_room']);
  assert.equal(q.relevant_compose.type, 'noul');
  assert.match(q.relevant_compose.instructions, /`sections\[0\]`/);
  assert.ok(q.relevant_compose.criteria.true.length > 20);
});

test('truncate cuts the prompt only', () => {
  const t = area.truncate({ prompt: 'x'.repeat(9000), sections: state.sections });
  assert.equal(t.prompt.length, area.MAX_PROMPT_CHARS);
  assert.deepEqual(t.sections, state.sections);
});
```

`test/dynamic-context-sections.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectSections, renderContext } from '../src/adapters/dynamic-context/sections.mjs';
import { readInjected, markInjected } from '../src/adapters/dynamic-context/session-state.mjs';

const sections = [
  { id: 'a', body: 'A'.repeat(400) },   // ~100 tokens
  { id: 'b', body: 'B'.repeat(400) },
  { id: 'c', body: 'C'.repeat(400) },
];
const answers = { relevant_a: { noul: 0.9 }, relevant_b: { noul: 0.7 }, relevant_c: { noul: 0.2 } };

test('selects above threshold, ordered by probability, excluding already injected', () => {
  assert.deepEqual(selectSections({ answers, sections, threshold: 0.5, budgetTokens: 6000, alreadyInjected: new Set() }), ['a', 'b']);
  assert.deepEqual(selectSections({ answers, sections, threshold: 0.5, budgetTokens: 6000, alreadyInjected: new Set(['a']) }), ['b']);
});

test('budget cuts the lowest-probability sections first', () => {
  assert.deepEqual(selectSections({ answers, sections, threshold: 0.1, budgetTokens: 150, alreadyInjected: new Set() }), ['a']);
  assert.deepEqual(selectSections({ answers, sections, threshold: 0.1, budgetTokens: 250, alreadyInjected: new Set() }), ['a', 'b']);
});

test('missing answers are treated as not relevant', () => {
  assert.deepEqual(selectSections({ answers: {}, sections, threshold: 0.5, budgetTokens: 6000, alreadyInjected: new Set() }), []);
});

test('renderContext has the header and each body', () => {
  const out = renderContext([sections[0], sections[1]]);
  assert.ok(out.startsWith('Project rules selected for this task (JEV):\n\n'));
  assert.match(out, /AAAA/);
  assert.match(out, /BBBB/);
});

test('session state round-trips and tolerates a corrupt file', async () => {
  const dir = join(await mkdtemp(join(tmpdir(), 'jevdc-')), 'state');
  assert.deepEqual([...(await readInjected(dir, 's1'))], []);
  await markInjected(dir, 's1', ['a', 'b']);
  await markInjected(dir, 's1', ['b', 'c']);
  assert.deepEqual([...(await readInjected(dir, 's1'))].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...(await readInjected(dir, 's2'))], []);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(dir, 's3.json'), '{ nope');
  assert.deepEqual([...(await readInjected(dir, 's3'))], []);
});
```

`test/dynamic-context-hook.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDynamicContext } from '../src/adapters/dynamic-context/hook.mjs';
import { DEFAULTS } from '../src/client/config.mjs';

async function target() {
  const dir = await mkdtemp(join(tmpdir(), 'jevdct-'));
  const rules = join(dir, '.claude', 'jev-rules');
  await mkdir(rules, { recursive: true });
  await writeFile(join(rules, '00-core.md'), '---\nid: core\nalways: true\n---\ncore body\n');
  await writeFile(join(rules, '02-compose.md'), '---\nid: compose\nsummary: Compose rules\npaths:\n  - "**/ui/**"\n---\n# Compose\ncompose body\n');
  await writeFile(join(rules, '05-room.md'), '---\nid: room\nsummary: Room rules\n---\n# Room\nroom body\n');
  return dir;
}

async function cfg(dir, overrides = {}) {
  return { ...DEFAULTS, logDir: join(dir, 'logs'), recordingsDir: join(dir, 'rec'), allowedRoots: [dir], apiKey: 'K', disabled: false, configMissing: false, configInvalid: false, ...overrides };
}

const fetchWith = (nouls) => async () => ({ status: 200, text: async () => JSON.stringify({ answers: Object.fromEntries(Object.entries(nouls).map(([k, v]) => [k, { type: 'noul', noul: v }])) }) });
const input = (dir, prompt, extra = {}) => ({ session_id: 'sess', cwd: dir, hook_event_name: 'UserPromptSubmit', user_prompt: prompt, ...extra });

test('injects relevant sections in full, never core, with the header', async () => {
  const dir = await target();
  const r = await runDynamicContext(input(dir, 'Add a dark preview to SocketListScreen'), { config: await cfg(dir), fetchImpl: fetchWith({ relevant_compose: 0.9, relevant_room: 0.1 }) });
  const ctx = r.output.hookSpecificOutput.additionalContext;
  assert.equal(r.output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(ctx, /^Project rules selected for this task \(JEV\):/);
  assert.match(ctx, /compose body/);
  assert.doesNotMatch(ctx, /room body/);
  assert.doesNotMatch(ctx, /core body/);
  assert.equal(r.exitCode, 0);
});

test('second prompt in the same session injects only new sections', async () => {
  const dir = await target();
  const config = await cfg(dir);
  await runDynamicContext(input(dir, 'p1'), { config, fetchImpl: fetchWith({ relevant_compose: 0.9, relevant_room: 0.1 }) });
  let sent;
  const f = async (url, init) => { sent = JSON.parse(init.body); return fetchWith({ relevant_room: 0.8 })(); };
  const r = await runDynamicContext(input(dir, 'p2'), { config, fetchImpl: f });
  assert.deepEqual(sent.state.sections.map((s) => s.id), ['room']);
  assert.match(r.output.hookSpecificOutput.additionalContext, /room body/);
  assert.doesNotMatch(r.output.hookSpecificOutput.additionalContext, /compose body/);
});

test('nothing relevant, no rules folder, empty prompt, Jev failure, disabled, and foreign cwd all yield null', async () => {
  const dir = await target();
  const config = await cfg(dir);
  assert.deepEqual(await runDynamicContext(input(dir, 'p'), { config, fetchImpl: fetchWith({ relevant_compose: 0.2, relevant_room: 0.1 }) }), { output: null, exitCode: 0 });
  const bare = await mkdtemp(join(tmpdir(), 'jevbare-'));
  assert.deepEqual(await runDynamicContext(input(bare, 'p'), { config: await cfg(bare), fetchImpl: fetchWith({}) }), { output: null, exitCode: 0 });
  assert.deepEqual(await runDynamicContext(input(dir, ''), { config, fetchImpl: fetchWith({}) }), { output: null, exitCode: 0 });
  assert.deepEqual(await runDynamicContext(input(dir, 'p'), { config, fetchImpl: async () => { throw new TypeError('down'); } }), { output: null, exitCode: 0 });
  assert.deepEqual(await runDynamicContext(input(dir, 'p'), { config: await cfg(dir, { disabled: true }), fetchImpl: fetchWith({}) }), { output: null, exitCode: 0 });
  const r = await runDynamicContext(input(dir, 'p', { cwd: '/elsewhere' }), { config, fetchImpl: fetchWith({}) });
  assert.deepEqual(r, { output: null, exitCode: 0 });
  const log = await readFile(join(config.logDir, 'dynamic-context.jsonl'), 'utf8');
  assert.match(log, /"event":"skipped"/);
});

test('accepts the legacy prompt field name', async () => {
  const dir = await target();
  const r = await runDynamicContext({ session_id: 's', cwd: dir, prompt: 'p' }, { config: await cfg(dir), fetchImpl: fetchWith({ relevant_compose: 0.9, relevant_room: 0.9 }) });
  assert.match(r.output.hookSpecificOutput.additionalContext, /compose body/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/questions-dynamic-context.test.mjs test/dynamic-context-sections.test.mjs test/dynamic-context-hook.test.mjs`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the implementations**

`src/questions/dynamic-context.mjs`:
```js
import { noul } from '../client/schema.mjs';

export const version = '1';
export const thresholds = Object.freeze({ relevant: 0.5 });
export const MAX_PROMPT_CHARS = 8000;
// tuned: not yet; initial threshold from spec 7.4.

const TRUE = 'Carrying out `prompt` would require reading, writing, or changing something the section governs, so its rules must be followed while doing the work.';
const FALSE = 'The work described by `prompt` does not touch what the section governs; following its rules would change nothing about the result.';

export function buildQuestions(state) {
  const questions = {};
  state.sections.forEach((s, i) => {
    questions[`relevant_${s.id}`] = noul(
      `Does the section described in \`sections[${i}]\`.summary apply to the task in \`prompt\`?`,
      { true: TRUE, false: FALSE },
    );
  });
  return questions;
}

export function truncate(state) {
  return { ...state, prompt: String(state.prompt).slice(0, MAX_PROMPT_CHARS) };
}
```

`src/adapters/dynamic-context/sections.mjs`:
```js
import { estimateTokens } from '../../client/tokens.mjs';

const HEADER = 'Project rules selected for this task (JEV):\n\n';

/** Pure: ranks sections by relevance probability and fits them into the token budget. */
export function selectSections({ answers, sections, threshold, budgetTokens, alreadyInjected }) {
  const ranked = sections
    .filter((s) => !alreadyInjected.has(s.id))
    .map((s) => ({ s, p: answers[`relevant_${s.id}`]?.noul ?? 0 }))
    .filter(({ p }) => p >= threshold)
    .sort((a, b) => b.p - a.p);
  const chosen = [];
  let used = 0;
  for (const { s } of ranked) {
    const cost = estimateTokens(s.body);
    if (used + cost > budgetTokens) continue;
    used += cost;
    chosen.push(s.id);
  }
  return chosen;
}

export function renderContext(selected) {
  return HEADER + selected.map((s) => s.body.trim()).join('\n\n') + '\n';
}
```

`src/adapters/dynamic-context/session-state.mjs`:
```js
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function pathFor(stateDir, sessionId) {
  return join(stateDir, `${String(sessionId || 'no-session').replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
}

export async function readInjected(stateDir, sessionId) {
  try {
    const data = JSON.parse(await readFile(pathFor(stateDir, sessionId), 'utf8'));
    return new Set(Array.isArray(data.injected) ? data.injected : []);
  } catch {
    return new Set();
  }
}

export async function markInjected(stateDir, sessionId, ids) {
  await mkdir(stateDir, { recursive: true });
  const current = await readInjected(stateDir, sessionId);
  for (const id of ids) current.add(id);
  await writeFile(pathFor(stateDir, sessionId), JSON.stringify({ injected: [...current] }));
}
```

`src/adapters/dynamic-context/hook.mjs`:
```js
import { join } from 'node:path';
import { loadConfig } from '../../client/config.mjs';
import { isAllowedRoot } from '../../client/guard.mjs';
import { appendLog } from '../../client/log.mjs';
import { decide } from '../../client/jev-client.mjs';
import { loadRules } from '../../targets/rules.mjs';
import { thresholds } from '../../questions/dynamic-context.mjs';
import { selectSections, renderContext } from './sections.mjs';
import { readInjected, markInjected } from './session-state.mjs';

const AREA = 'dynamic-context';
const NOTHING = { output: null, exitCode: 0 };

async function skipLog(config, fields) {
  try { await appendLog(config.logDir, AREA, { ts: new Date().toISOString(), area: AREA, event: 'skipped', ...fields }); } catch { /* best-effort */ }
}

/** Never throws; every failure injects nothing. */
export async function runDynamicContext(input, opts = {}) {
  try {
    const config = opts.config ?? loadConfig();
    const fetchImpl = opts.fetchImpl ?? fetch;
    const decideImpl = opts.decideImpl ?? decide;
    const loadRulesImpl = opts.loadRulesImpl ?? loadRules;
    if (config.disabled) return NOTHING;
    const cwd = input.cwd ?? process.cwd();
    if (config.configMissing || !isAllowedRoot(cwd, config.allowedRoots)) {
      await skipLog(config, { reason: config.configMissing ? 'config_missing' : 'not_allowed_root', cwd });
      return NOTHING;
    }
    const prompt = (input.user_prompt ?? input.prompt ?? '').trim();
    if (!prompt) return NOTHING;

    let rules;
    try { rules = await loadRulesImpl(join(cwd, '.claude', 'jev-rules')); } catch { return NOTHING; }
    const stateDir = join(config.logDir, 'state', AREA);
    const already = await readInjected(stateDir, input.session_id);
    const candidates = rules.filter((r) => !r.always && !already.has(r.id));
    if (!candidates.length) return NOTHING;

    const r = await decideImpl(AREA, { prompt, sections: candidates.map((s) => ({ id: s.id, summary: s.summary })) }, { cwd, sessionId: input.session_id ?? null, config, fetchImpl });
    if (!r.ok) return NOTHING;

    const ids = selectSections({ answers: r.answers, sections: candidates, threshold: thresholds.relevant, budgetTokens: config.contextBudgetTokens, alreadyInjected: already });
    if (!ids.length) return NOTHING;
    const selected = ids.map((id) => candidates.find((s) => s.id === id));
    await markInjected(stateDir, input.session_id, ids);
    return { output: { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: renderContext(selected) } }, exitCode: 0 };
  } catch {
    return NOTHING;
  }
}
```

`bin/jev-hook-dynamic-context.mjs`:
```js
#!/usr/bin/env node
import { readStdinJson, writeHookOutput, EXIT } from '../src/hooks/io.mjs';
import { runDynamicContext } from '../src/adapters/dynamic-context/hook.mjs';

const input = await readStdinJson();
const { output, exitCode } = await runDynamicContext(input);
writeHookOutput(output);
process.exitCode = exitCode ?? EXIT.OK;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/questions-dynamic-context.test.mjs test/dynamic-context-sections.test.mjs test/dynamic-context-hook.test.mjs`
Expected: 11 passing. In the budget test each body is 400 chars, about 100 tokens; a budget of 150 fits one, 250 fits two.

- [ ] **Step 5: Commit**

```bash
chmod +x bin/jev-hook-dynamic-context.mjs
git add src/questions/dynamic-context.mjs src/adapters/dynamic-context bin/jev-hook-dynamic-context.mjs test/questions-dynamic-context.test.mjs test/dynamic-context-sections.test.mjs test/dynamic-context-hook.test.mjs
git commit -m "feat: dynamic-context UserPromptSubmit hook"
```

---

### Task 5: Hand-back check (SubagentStart snapshot + SubagentStop card)

**Files:**
- Create: `src/questions/handback-check.mjs`, `src/adapters/handback-check/git.mjs`, `snapshot.mjs`, `facts.mjs`, `card.mjs`, `start-hook.mjs`, `hook.mjs`, `bin/jev-hook-subagent-start.mjs`, `bin/jev-hook-handback.mjs`
- Test: `test/questions-handback.test.mjs`, `test/handback-git.test.mjs`, `test/handback-card.test.mjs`, `test/handback-hook.test.mjs`

**Interfaces:**
- Area module: `version = '1'`, `thresholds = { claim: 0.8, blocker: 0.5 }`, `MAX_SUMMARY_CHARS = 12000`, `buildQuestions(state)` with state `{ summary, agent_type }` → six Nouls `claims_tests_run`, `claims_tests_pass`, `claims_build_ok`, `claims_tests_added`, `claims_complete`, `reports_blocker`; `truncate` cuts `summary`.
- `runGit(cwd, args): string | null` (null on non-zero exit or missing git), `isGitRepo(cwd): boolean`.
- `takeSnapshot(cwd): { files: { [path]: string } }` where the value is `git hash-object` of each path from `git status --porcelain -uall` (deleted → `'deleted'`). `diffSnapshots(before, after): string[]` paths present in `after` with a different or missing hash in `before`.
- `collectFacts(cwd, { before }): Facts` with `Facts = { isGitRepo, filesChanged: string[], testFilesChanged: boolean, insertions, deletions, untracked: number, attribution: 'snapshot' | 'head' | 'none' }`. With `before`, `filesChanged = diffSnapshots(before, takeSnapshot(cwd))`; without, files from `git status --porcelain -uall`. `insertions`/`deletions` summed from `git diff --numstat HEAD -- <files>` (untracked files count their line count as insertions). Test file = path contains `/test/` or `/androidTest/` or ends `Test.kt`.
- `mentionedNotInDiff(summary, facts): string[]` paths matching `/[\w./-]+\.(kt|kts|gradle|kts|xml|md|mjs|json)\b/` in the summary, normalised to their basename-or-suffix match, that end no path in `filesChanged`.
- `flagsFor({ answers, facts, thresholds, summary }): string[]` rules: `claims_tests_added ≥ claim && !testFilesChanged` → `"claims tests added; no test files changed"`; `claims_complete ≥ claim && reports_blocker ≥ blocker` → `"claims complete while reporting a blocker"`; `claims_tests_pass ≥ claim && filesChanged.length === 0` → `"claims tests pass; no files changed"`; each `mentionedNotInDiff` → `"mentions <path> which is not in the diff"`. With `answers === null` only the mention rule applies.
- `renderCard({ agentType, model, flags, facts, answers }): string` in the fixed format below; `answers === null` prints `Claims: unavailable (Jev <reason>)`.
- `runSubagentStart(input, opts)` writes `<logDir>/handback/<agent_id>.start.json` = snapshot; returns `{ output: null, exitCode: 0 }` always.
- `runHandbackCheck(input, opts)` → `{ output: { hookSpecificOutput: { hookEventName: 'SubagentStop', additionalContext: card } }, exitCode: 0 }` or `{ output: null, exitCode: 0 }` for excluded agent types (`Explore`, `Plan`, `claude-code-guide`), non-git cwd, disabled, guard refusal. Also writes `<logDir>/handback/<agent_id>.card.md` and deletes the start snapshot.

Card format:
```
JEV hand-back check (<agent_type>, <model or 'unknown model'>)
Flags: none | <flag 1>; <flag 2>
Facts: files changed <n> (<up to 8 paths, comma-separated>), test files changed <yes|no>, +<ins>/-<del>, untracked <n>, attribution <snapshot|head>
Claims: tests run <p>, tests pass <p>, build ok <p>, tests added <p>, complete <p>, blocker <p>
Unverified: build ok, tests pass
Read full diff: yes | stat only is sufficient
```
Probabilities print with two decimals. `Read full diff: yes` when `flags.length > 0`.

- [ ] **Step 1: Write the failing tests**

`test/questions-handback.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as area from '../src/questions/handback-check.mjs';

test('contract and six nouls about the summary only', () => {
  assert.equal(area.version, '1');
  assert.deepEqual(area.thresholds, { claim: 0.8, blocker: 0.5 });
  const q = area.buildQuestions({ summary: 'Added tests, all green', agent_type: 'general-purpose' });
  assert.deepEqual(Object.keys(q).sort(), ['claims_build_ok', 'claims_complete', 'claims_tests_added', 'claims_tests_pass', 'claims_tests_run', 'reports_blocker']);
  for (const v of Object.values(q)) { assert.equal(v.type, 'noul'); assert.match(v.instructions, /`summary`/); }
});

test('truncate cuts the summary', () => {
  assert.equal(area.truncate({ summary: 'x'.repeat(20000), agent_type: 'a' }).summary.length, area.MAX_SUMMARY_CHARS);
});
```

`test/handback-git.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runGit, isGitRepo } from '../src/adapters/handback-check/git.mjs';
import { takeSnapshot, diffSnapshots } from '../src/adapters/handback-check/snapshot.mjs';
import { collectFacts, mentionedNotInDiff } from '../src/adapters/handback-check/facts.mjs';

async function repo() {
  const dir = await mkdtemp(join(tmpdir(), 'jevgit-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  await mkdir(join(dir, 'src'));
  await writeFile(join(dir, 'src', 'A.kt'), 'class A\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  return dir;
}

test('runGit returns stdout or null; isGitRepo', async () => {
  const dir = await repo();
  assert.match(runGit(dir, ['rev-parse', '--abbrev-ref', 'HEAD']), /main/);
  assert.equal(runGit(dir, ['rev-parse', '--verify', 'nope']), null);
  assert.equal(isGitRepo(dir), true);
  assert.equal(isGitRepo(await mkdtemp(join(tmpdir(), 'jevnogit-'))), false);
});

test('snapshot diff attributes only the changes made after the snapshot', async () => {
  const dir = await repo();
  await writeFile(join(dir, 'src', 'B.kt'), 'class B\n');           // dirty before the subagent
  const before = takeSnapshot(dir);
  assert.deepEqual(Object.keys(before.files), ['src/B.kt']);
  await writeFile(join(dir, 'src', 'A.kt'), 'class A { val x = 1 }\n'); // subagent edits tracked file
  await writeFile(join(dir, 'src', 'ATest.kt'), 'class ATest\n');    // subagent adds a test
  await writeFile(join(dir, 'src', 'B.kt'), 'class B\n');            // untouched content
  const after = takeSnapshot(dir);
  assert.deepEqual(diffSnapshots(before, after).sort(), ['src/A.kt', 'src/ATest.kt']);
});

test('collectFacts with a snapshot: files, test flag, counts, attribution', async () => {
  const dir = await repo();
  const before = takeSnapshot(dir);
  await writeFile(join(dir, 'src', 'A.kt'), 'class A\nval y = 2\n');
  await writeFile(join(dir, 'src', 'ATest.kt'), 'class ATest\nfun t() {}\n');
  const f = collectFacts(dir, { before });
  assert.equal(f.isGitRepo, true);
  assert.deepEqual(f.filesChanged.sort(), ['src/A.kt', 'src/ATest.kt']);
  assert.equal(f.testFilesChanged, true);
  assert.equal(f.insertions, 3);
  assert.equal(f.deletions, 0);
  assert.equal(f.untracked, 1);
  assert.equal(f.attribution, 'snapshot');
});

test('collectFacts without a snapshot falls back to HEAD and reports attribution head; non-repo reports none', async () => {
  const dir = await repo();
  await writeFile(join(dir, 'src', 'A.kt'), 'class A2\n');
  const f = collectFacts(dir, {});
  assert.deepEqual(f.filesChanged, ['src/A.kt']);
  assert.equal(f.testFilesChanged, false);
  assert.equal(f.attribution, 'head');
  const g = collectFacts(await mkdtemp(join(tmpdir(), 'jevnogit-')), {});
  assert.equal(g.isGitRepo, false);
  assert.equal(g.attribution, 'none');
  assert.deepEqual(g.filesChanged, []);
});

test('mentionedNotInDiff finds paths the summary names that the diff does not contain', () => {
  const facts = { filesChanged: ['inspector/src/main/kotlin/x/SessionTracker.kt'] };
  const summary = 'Edited SessionTracker.kt and added internal/data/FrameRepository.kt; also touched build.gradle.kts';
  assert.deepEqual(mentionedNotInDiff(summary, facts).sort(), ['build.gradle.kts', 'internal/data/FrameRepository.kt']);
  assert.deepEqual(mentionedNotInDiff('no files here', facts), []);
});
```

`test/handback-card.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flagsFor, renderCard } from '../src/adapters/handback-check/card.mjs';

const thresholds = { claim: 0.8, blocker: 0.5 };
const facts = { isGitRepo: true, filesChanged: ['src/A.kt'], testFilesChanged: false, insertions: 3, deletions: 1, untracked: 0, attribution: 'snapshot' };
const n = (v) => ({ noul: v });

test('flags: tests added without test files; complete with blocker; pass with no files; mentions', () => {
  const answers = { claims_tests_run: n(0.9), claims_tests_pass: n(0.9), claims_build_ok: n(0.2), claims_tests_added: n(0.95), claims_complete: n(0.9), reports_blocker: n(0.6) };
  const flags = flagsFor({ answers, facts, thresholds, summary: 'Added tests in ATest.kt' });
  assert.deepEqual(flags, ['claims tests added; no test files changed', 'claims complete while reporting a blocker', 'mentions ATest.kt which is not in the diff']);
  const none = flagsFor({ answers: { ...answers, claims_tests_added: n(0.1), reports_blocker: n(0.1) }, facts, thresholds, summary: 'Edited src/A.kt' });
  assert.deepEqual(none, []);
  const empty = flagsFor({ answers: { ...answers, claims_tests_added: n(0.1), reports_blocker: n(0.1) }, facts: { ...facts, filesChanged: [] }, thresholds, summary: 'done' });
  assert.deepEqual(empty, ['claims tests pass; no files changed']);
});

test('null answers: only the mention rule applies', () => {
  assert.deepEqual(flagsFor({ answers: null, facts, thresholds, summary: 'Edited src/A.kt and Other.kt' }), ['mentions Other.kt which is not in the diff']);
});

test('renderCard fixed format', () => {
  const answers = { claims_tests_run: n(0.9), claims_tests_pass: n(0.85), claims_build_ok: n(0.2), claims_tests_added: n(0.05), claims_complete: n(0.9), reports_blocker: n(0.1) };
  const card = renderCard({ agentType: 'general-purpose', model: 'opus', flags: [], facts, answers });
  const lines = card.split('\n');
  assert.equal(lines[0], 'JEV hand-back check (general-purpose, opus)');
  assert.equal(lines[1], 'Flags: none');
  assert.equal(lines[2], 'Facts: files changed 1 (src/A.kt), test files changed no, +3/-1, untracked 0, attribution snapshot');
  assert.equal(lines[3], 'Claims: tests run 0.90, tests pass 0.85, build ok 0.20, tests added 0.05, complete 0.90, blocker 0.10');
  assert.equal(lines[4], 'Unverified: build ok, tests pass');
  assert.equal(lines[5], 'Read full diff: stat only is sufficient');
  const flagged = renderCard({ agentType: 'a', model: undefined, flags: ['x', 'y'], facts, answers: null, reason: 'timeout' });
  assert.match(flagged, /\(a, unknown model\)/);
  assert.match(flagged, /^Flags: x; y$/m);
  assert.match(flagged, /^Claims: unavailable \(Jev timeout\)$/m);
  assert.match(flagged, /^Read full diff: yes$/m);
});

test('facts line caps the listed paths at eight', () => {
  const many = { ...facts, filesChanged: Array.from({ length: 12 }, (_, i) => `f${i}.kt`) };
  const card = renderCard({ agentType: 'a', model: 'm', flags: [], facts: many, answers: null, reason: 'x' });
  assert.match(card, /files changed 12 \(f0\.kt, f1\.kt, f2\.kt, f3\.kt, f4\.kt, f5\.kt, f6\.kt, f7\.kt, …\)/);
});
```

`test/handback-hook.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runSubagentStart } from '../src/adapters/handback-check/start-hook.mjs';
import { runHandbackCheck } from '../src/adapters/handback-check/hook.mjs';
import { DEFAULTS } from '../src/client/config.mjs';

async function repo() {
  const dir = await mkdtemp(join(tmpdir(), 'jevhb-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@e.com'); git('config', 'user.name', 't');
  await mkdir(join(dir, 'src')); await writeFile(join(dir, 'src', 'A.kt'), 'class A\n');
  git('add', '-A'); git('commit', '-q', '-m', 'base');
  return dir;
}
const cfg = (dir, o = {}) => ({ ...DEFAULTS, logDir: join(dir, 'logs'), recordingsDir: join(dir, 'rec'), allowedRoots: [dir], apiKey: 'K', disabled: false, configMissing: false, configInvalid: false, ...o });
const fetchWith = (nouls) => async () => ({ status: 200, text: async () => JSON.stringify({ answers: Object.fromEntries(Object.entries(nouls).map(([k, v]) => [k, { type: 'noul', noul: v }])) }) });
const ALL = { claims_tests_run: 0.9, claims_tests_pass: 0.9, claims_build_ok: 0.9, claims_tests_added: 0.95, claims_complete: 0.9, reports_blocker: 0.05 };
const stop = (dir, summary, extra = {}) => ({ session_id: 's', cwd: dir, hook_event_name: 'SubagentStop', agent_id: 'ag1', agent_type: 'general-purpose', last_assistant_message: summary, model: 'opus', ...extra });

test('start snapshot then stop: card attributes only the subagent changes and flags the missing tests', async () => {
  const dir = await repo();
  const config = cfg(dir);
  await writeFile(join(dir, 'src', 'Pre.kt'), 'class Pre\n');
  const s = await runSubagentStart({ session_id: 's', cwd: dir, agent_id: 'ag1', agent_type: 'general-purpose' }, { config });
  assert.deepEqual(s, { output: null, exitCode: 0 });
  await stat(join(config.logDir, 'handback', 'ag1.start.json'));
  await writeFile(join(dir, 'src', 'A.kt'), 'class A { }\n');
  const r = await runHandbackCheck(stop(dir, 'Implemented A and added tests in ATest.kt; all tests pass.'), { config, fetchImpl: fetchWith(ALL) });
  const card = r.output.hookSpecificOutput.additionalContext;
  assert.equal(r.output.hookSpecificOutput.hookEventName, 'SubagentStop');
  assert.match(card, /^JEV hand-back check \(general-purpose, opus\)/);
  assert.match(card, /files changed 1 \(src\/A\.kt\)/);
  assert.match(card, /attribution snapshot/);
  assert.match(card, /claims tests added; no test files changed/);
  assert.match(card, /mentions ATest\.kt which is not in the diff/);
  assert.match(card, /Read full diff: yes/);
  assert.equal(await readFile(join(config.logDir, 'handback', 'ag1.card.md'), 'utf8'), card);
  await assert.rejects(stat(join(config.logDir, 'handback', 'ag1.start.json')));
});

test('without a start snapshot the card falls back to HEAD attribution', async () => {
  const dir = await repo();
  await writeFile(join(dir, 'src', 'A.kt'), 'class A2\n');
  const r = await runHandbackCheck(stop(dir, 'Edited src/A.kt.', { agent_id: 'ag2' }), { config: cfg(dir), fetchImpl: fetchWith({ ...ALL, claims_tests_added: 0.05, claims_tests_pass: 0.1 }) });
  assert.match(r.output.hookSpecificOutput.additionalContext, /attribution head/);
  assert.match(r.output.hookSpecificOutput.additionalContext, /^Flags: none$/m);
});

test('Jev failure still yields a card with facts and code-only flags', async () => {
  const dir = await repo();
  await writeFile(join(dir, 'src', 'A.kt'), 'class A3\n');
  const r = await runHandbackCheck(stop(dir, 'Edited src/A.kt and Zed.kt', { agent_id: 'ag3' }), { config: cfg(dir), fetchImpl: async () => { throw new TypeError('down'); } });
  const card = r.output.hookSpecificOutput.additionalContext;
  assert.match(card, /Claims: unavailable \(Jev network\)/);
  assert.match(card, /mentions Zed\.kt which is not in the diff/);
});

test('excluded agent types, non-git cwd, disabled, and foreign cwd yield null', async () => {
  const dir = await repo();
  const config = cfg(dir);
  for (const t of ['Explore', 'Plan', 'claude-code-guide']) {
    assert.deepEqual(await runHandbackCheck(stop(dir, 'x', { agent_type: t }), { config, fetchImpl: fetchWith(ALL) }), { output: null, exitCode: 0 });
  }
  const bare = await mkdtemp(join(tmpdir(), 'jevnogit-'));
  assert.deepEqual(await runHandbackCheck(stop(bare, 'x'), { config: cfg(bare), fetchImpl: fetchWith(ALL) }), { output: null, exitCode: 0 });
  assert.deepEqual(await runHandbackCheck(stop(dir, 'x'), { config: cfg(dir, { disabled: true }), fetchImpl: fetchWith(ALL) }), { output: null, exitCode: 0 });
  assert.deepEqual(await runHandbackCheck(stop(dir, 'x', { cwd: '/elsewhere' }), { config, fetchImpl: fetchWith(ALL) }), { output: null, exitCode: 0 });
  assert.deepEqual(await runSubagentStart({ cwd: '/elsewhere', agent_id: 'z', agent_type: 'general-purpose' }, { config }), { output: null, exitCode: 0 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/questions-handback.test.mjs test/handback-git.test.mjs test/handback-card.test.mjs test/handback-hook.test.mjs`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the implementations**

`src/questions/handback-check.mjs`:
```js
import { noul } from '../client/schema.mjs';

export const version = '1';
export const thresholds = Object.freeze({ claim: 0.8, blocker: 0.5 });
export const MAX_SUMMARY_CHARS = 12000;
// tuned: not yet; initial thresholds from spec 7.2.

const Q = {
  claims_tests_run: ['`summary` states that tests were executed.', 'It names a test command that was run, or says tests were run or executed.', 'It never says tests were run; at most it says tests exist or should be run.'],
  claims_tests_pass: ['`summary` states that tests passed.', 'It says tests pass, are green, or reports a pass count with zero failures.', 'It reports failures, does not mention results, or only says tests were written.'],
  claims_build_ok: ['`summary` states that the build or compile succeeded.', 'It says the build, compile, or type check passed or is green.', 'It does not mention the build, or reports a build failure.'],
  claims_tests_added: ['`summary` states that new tests were written.', 'It says tests were added, written, or created, or names new test files.', 'It mentions no new tests, or only that existing tests were run.'],
  claims_complete: ['`summary` presents the work as finished with nothing left out.', 'It says done, complete, implemented, or lists every requested item as delivered without exceptions.', 'It says partial, remaining, skipped, blocked, or lists items not done.'],
  reports_blocker: ['`summary` reports something skipped, failed, or blocked.', 'It names a step that could not be done, a failing check, a missing dependency, or asks for a decision.', 'It reports no problems and asks for nothing.'],
};

export function buildQuestions() {
  return Object.fromEntries(Object.entries(Q).map(([id, [instructions, t, f]]) => [id, noul(instructions, { true: t, false: f })]));
}

export function truncate(state) {
  return { ...state, summary: String(state.summary).slice(0, MAX_SUMMARY_CHARS) };
}
```

`src/adapters/handback-check/git.mjs`:
```js
import { execFileSync } from 'node:child_process';

/** Runs git in cwd and returns trimmed stdout, or null on any failure. */
export function runGit(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
  } catch {
    return null;
  }
}

export function isGitRepo(cwd) {
  return runGit(cwd, ['rev-parse', '--is-inside-work-tree']) === 'true';
}
```

`src/adapters/handback-check/snapshot.mjs`:
```js
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runGit } from './git.mjs';

/** Paths from `git status --porcelain -uall`, including renames' new names. */
export function dirtyPaths(cwd) {
  const out = runGit(cwd, ['status', '--porcelain', '-uall']);
  if (!out) return [];
  return out.split('\n').filter(Boolean).map((line) => {
    const path = line.slice(3);
    return path.includes(' -> ') ? path.split(' -> ')[1] : path;
  });
}

/** Content hash of every dirty path, so a later snapshot can tell what changed in between. */
export function takeSnapshot(cwd) {
  const files = {};
  for (const path of dirtyPaths(cwd)) {
    files[path] = existsSync(join(cwd, path)) ? (runGit(cwd, ['hash-object', '--', path]) ?? 'unhashable') : 'deleted';
  }
  return { files };
}

export function diffSnapshots(before, after) {
  return Object.entries(after.files).filter(([path, hash]) => before.files[path] !== hash).map(([path]) => path);
}
```

`src/adapters/handback-check/facts.mjs`:
```js
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runGit, isGitRepo } from './git.mjs';
import { takeSnapshot, diffSnapshots, dirtyPaths } from './snapshot.mjs';

const TEST_PATH = /(\/test\/|\/androidTest\/|Test\.kt$)/;
const PATH_IN_TEXT = /[\w./-]+\.(?:kt|kts|gradle|xml|md|mjs|json)\b/g;

function untrackedPaths(cwd) {
  const out = runGit(cwd, ['ls-files', '--others', '--exclude-standard']);
  return out ? out.split('\n').filter(Boolean) : [];
}

function lineCounts(cwd, files, untracked) {
  let insertions = 0;
  let deletions = 0;
  const tracked = files.filter((f) => !untracked.has(f));
  if (tracked.length) {
    const out = runGit(cwd, ['diff', '--numstat', 'HEAD', '--', ...tracked]) ?? '';
    for (const line of out.split('\n').filter(Boolean)) {
      const [ins, del] = line.split('\t');
      insertions += Number(ins) || 0;
      deletions += Number(del) || 0;
    }
  }
  for (const f of files.filter((f) => untracked.has(f))) {
    const full = join(cwd, f);
    if (existsSync(full)) insertions += readFileSync(full, 'utf8').split('\n').filter(Boolean).length;
  }
  return { insertions, deletions };
}

/** Deterministic facts about what changed. Jev never sees these; code combines them with its answers. */
export function collectFacts(cwd, { before } = {}) {
  if (!isGitRepo(cwd)) return { isGitRepo: false, filesChanged: [], testFilesChanged: false, insertions: 0, deletions: 0, untracked: 0, attribution: 'none' };
  const filesChanged = before ? diffSnapshots(before, takeSnapshot(cwd)) : dirtyPaths(cwd);
  const untracked = new Set(untrackedPaths(cwd));
  const { insertions, deletions } = lineCounts(cwd, filesChanged, untracked);
  return {
    isGitRepo: true,
    filesChanged,
    testFilesChanged: filesChanged.some((f) => TEST_PATH.test(f)),
    insertions,
    deletions,
    untracked: filesChanged.filter((f) => untracked.has(f)).length,
    attribution: before ? 'snapshot' : 'head',
  };
}

/** File paths the summary names that no changed path ends with. */
export function mentionedNotInDiff(summary, facts) {
  const mentioned = [...new Set((summary.match(PATH_IN_TEXT) ?? []).map((m) => m.replace(/^\.\//, '')))];
  return mentioned.filter((m) => !facts.filesChanged.some((f) => f === m || f.endsWith(`/${m}`)));
}
```

`src/adapters/handback-check/card.mjs`:
```js
import { mentionedNotInDiff } from './facts.mjs';

const CLAIMS = [['claims_tests_run', 'tests run'], ['claims_tests_pass', 'tests pass'], ['claims_build_ok', 'build ok'], ['claims_tests_added', 'tests added'], ['claims_complete', 'complete'], ['reports_blocker', 'blocker']];
const MAX_LISTED = 8;

const p = (answers, id) => answers?.[id]?.noul ?? 0;

/** Pure: contradictions between what the summary claims and what the tree shows. */
export function flagsFor({ answers, facts, thresholds, summary }) {
  const flags = [];
  if (answers) {
    if (p(answers, 'claims_tests_added') >= thresholds.claim && !facts.testFilesChanged) flags.push('claims tests added; no test files changed');
    if (p(answers, 'claims_complete') >= thresholds.claim && p(answers, 'reports_blocker') >= thresholds.blocker) flags.push('claims complete while reporting a blocker');
    if (p(answers, 'claims_tests_pass') >= thresholds.claim && facts.filesChanged.length === 0) flags.push('claims tests pass; no files changed');
  }
  for (const path of mentionedNotInDiff(summary, facts)) flags.push(`mentions ${path} which is not in the diff`);
  return flags;
}

export function renderCard({ agentType, model, flags, facts, answers, reason }) {
  const listed = facts.filesChanged.slice(0, MAX_LISTED).join(', ') + (facts.filesChanged.length > MAX_LISTED ? ', …' : '');
  const claims = answers
    ? CLAIMS.map(([id, label]) => `${label} ${p(answers, id).toFixed(2)}`).join(', ')
    : `unavailable (Jev ${reason ?? 'unavailable'})`;
  return [
    `JEV hand-back check (${agentType}, ${model ?? 'unknown model'})`,
    `Flags: ${flags.length ? flags.join('; ') : 'none'}`,
    `Facts: files changed ${facts.filesChanged.length} (${listed}), test files changed ${facts.testFilesChanged ? 'yes' : 'no'}, +${facts.insertions}/-${facts.deletions}, untracked ${facts.untracked}, attribution ${facts.attribution}`,
    `Claims: ${claims}`,
    'Unverified: build ok, tests pass',
    `Read full diff: ${flags.length ? 'yes' : 'stat only is sufficient'}`,
  ].join('\n');
}
```

`src/adapters/handback-check/start-hook.mjs`:
```js
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../../client/config.mjs';
import { isAllowedRoot } from '../../client/guard.mjs';
import { isGitRepo } from './git.mjs';
import { takeSnapshot } from './snapshot.mjs';

const NOTHING = { output: null, exitCode: 0 };

export function snapshotPath(logDir, agentId) {
  return join(logDir, 'handback', `${String(agentId || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_')}.start.json`);
}

/** Records the dirty-tree hashes when a subagent starts so its own changes can be isolated at stop. Never throws. */
export async function runSubagentStart(input, opts = {}) {
  try {
    const config = opts.config ?? loadConfig();
    if (config.disabled) return NOTHING;
    const cwd = input.cwd ?? process.cwd();
    if (config.configMissing || !isAllowedRoot(cwd, config.allowedRoots) || !isGitRepo(cwd)) return NOTHING;
    const path = snapshotPath(config.logDir, input.agent_id);
    await mkdir(join(config.logDir, 'handback'), { recursive: true });
    await writeFile(path, JSON.stringify({ ts: new Date().toISOString(), agent_type: input.agent_type ?? null, ...takeSnapshot(cwd) }));
    return NOTHING;
  } catch {
    return NOTHING;
  }
}
```

`src/adapters/handback-check/hook.mjs`:
```js
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../../client/config.mjs';
import { isAllowedRoot } from '../../client/guard.mjs';
import { appendLog } from '../../client/log.mjs';
import { decide } from '../../client/jev-client.mjs';
import { thresholds } from '../../questions/handback-check.mjs';
import { isGitRepo } from './git.mjs';
import { collectFacts } from './facts.mjs';
import { flagsFor, renderCard } from './card.mjs';
import { snapshotPath } from './start-hook.mjs';

const AREA = 'handback-check';
const EXCLUDED = new Set(['Explore', 'Plan', 'claude-code-guide']);
const NOTHING = { output: null, exitCode: 0 };

async function skipLog(config, fields) {
  try { await appendLog(config.logDir, AREA, { ts: new Date().toISOString(), area: AREA, event: 'skipped', ...fields }); } catch { /* best-effort */ }
}

async function readSnapshot(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

/** Never throws. Builds the hand-back card for the parent agent; on Jev failure the card still carries facts. */
export async function runHandbackCheck(input, opts = {}) {
  try {
    const config = opts.config ?? loadConfig();
    const fetchImpl = opts.fetchImpl ?? fetch;
    const decideImpl = opts.decideImpl ?? decide;
    if (config.disabled) return NOTHING;
    const cwd = input.cwd ?? process.cwd();
    if (config.configMissing || !isAllowedRoot(cwd, config.allowedRoots)) {
      await skipLog(config, { reason: config.configMissing ? 'config_missing' : 'not_allowed_root', cwd });
      return NOTHING;
    }
    const agentType = input.agent_type ?? 'unknown';
    if (EXCLUDED.has(agentType) || !isGitRepo(cwd)) return NOTHING;

    const summary = String(input.last_assistant_message ?? '');
    const startPath = snapshotPath(config.logDir, input.agent_id);
    const before = await readSnapshot(startPath);
    const facts = collectFacts(cwd, { before: before ? { files: before.files ?? {} } : undefined });

    const r = await decideImpl(AREA, { summary, agent_type: agentType }, { cwd, sessionId: input.session_id ?? null, config, fetchImpl });
    const answers = r.ok ? r.answers : null;
    const flags = flagsFor({ answers, facts, thresholds, summary });
    const card = renderCard({ agentType, model: input.model, flags, facts, answers, reason: r.ok ? undefined : r.reason });

    try {
      await mkdir(join(config.logDir, 'handback'), { recursive: true });
      await writeFile(startPath.replace(/\.start\.json$/, '.card.md'), card);
      await rm(startPath, { force: true });
    } catch { /* best-effort */ }

    return { output: { hookSpecificOutput: { hookEventName: 'SubagentStop', additionalContext: card } }, exitCode: 0 };
  } catch {
    return NOTHING;
  }
}
```

`bin/jev-hook-subagent-start.mjs` and `bin/jev-hook-handback.mjs`: same four-line shape as the other hook bins, importing `runSubagentStart` and `runHandbackCheck` respectively, ending with `process.exitCode = exitCode ?? EXIT.OK;`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/questions-handback.test.mjs test/handback-git.test.mjs test/handback-card.test.mjs test/handback-hook.test.mjs`
Expected: 13 passing. In the facts count test, `A.kt` gains one line (`+1`) and the untracked `ATest.kt` has two non-empty lines (`+2`), total `insertions 3`. If `hash-object` fails on a deleted path, confirm the `existsSync` branch runs first.

- [ ] **Step 5: Commit**

```bash
chmod +x bin/jev-hook-subagent-start.mjs bin/jev-hook-handback.mjs
git add src/questions/handback-check.mjs src/adapters/handback-check bin/jev-hook-subagent-start.mjs bin/jev-hook-handback.mjs test/questions-handback.test.mjs test/handback-git.test.mjs test/handback-card.test.mjs test/handback-hook.test.mjs
git commit -m "feat: hand-back check with SubagentStart snapshot and SubagentStop card"
```

---

### Task 6: Model router CLI and skill

**Files:**
- Create: `src/questions/model-router.mjs`, `src/adapters/model-router/route.mjs`, `bin/jev-route.mjs`, `skills/model-router/SKILL.md`
- Test: `test/questions-model-router.test.mjs`, `test/model-router.test.mjs`

**Interfaces:**
- Area module: `version = '1'`, `thresholds = { confidence: 0.6 }`, `MAX_BRIEF_CHARS = 12000`, `TIERS = ['haiku', 'sonnet', 'opus']`, `buildQuestions(state)` with state `{ brief }` → `tier` (Choice over the three tiers), `needs_broad_exploration` (Noul), `asks_for_change` (Noul); `truncate` cuts `brief`.
- `route(brief, opts): Promise<Route>` with `opts = { config?, fetchImpl?, decideImpl?, cwd? }` and
  `Route = { tier, confidence, probabilities, needs_broad_exploration, asks_for_change, fallback_used, latency_ms }` or `{ tier: null, error: string }`. Fallback when `confidence < thresholds.confidence`: `tier = asks_for_change >= 0.5 ? 'opus' : 'sonnet'`, `fallback_used = true`.
- Bin: `node bin/jev-route.mjs [--brief <file>]` (stdin when no flag). Prints the JSON on one line. Exit 0 on a route, 3 on error, 1 when the brief is empty.

- [ ] **Step 1: Write the failing tests**

`test/questions-model-router.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as area from '../src/questions/model-router.mjs';

test('contract: choice over three tiers plus two nouls', () => {
  assert.equal(area.version, '1');
  assert.deepEqual(area.thresholds, { confidence: 0.6 });
  assert.deepEqual(area.TIERS, ['haiku', 'sonnet', 'opus']);
  const q = area.buildQuestions({ brief: 'Find which module owns FrameStore' });
  assert.deepEqual(Object.keys(q).sort(), ['asks_for_change', 'needs_broad_exploration', 'tier']);
  assert.equal(q.tier.type, 'choice');
  assert.deepEqual(Object.keys(q.tier.criteria), ['haiku', 'sonnet', 'opus']);
  for (const v of Object.values(q.tier.criteria)) assert.ok(v.length > 30);
  assert.match(q.tier.instructions, /`brief`/);
  assert.equal(q.needs_broad_exploration.type, 'noul');
  assert.equal(q.asks_for_change.type, 'noul');
});

test('truncate cuts the brief', () => {
  assert.equal(area.truncate({ brief: 'x'.repeat(20000) }).brief.length, area.MAX_BRIEF_CHARS);
});
```

`test/model-router.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { route } from '../src/adapters/model-router/route.mjs';
import { DEFAULTS, toolkitRoot } from '../src/client/config.mjs';

async function cfg(o = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'jevrt-'));
  return { ...DEFAULTS, logDir: join(dir, 'logs'), recordingsDir: join(dir, 'rec'), allowedRoots: ['/allowed'], apiKey: 'K', disabled: false, configMissing: false, configInvalid: false, ...o };
}
const fetchWith = ({ tier, conf, probs, broad, change }) => async () => ({ status: 200, text: async () => JSON.stringify({ answers: {
  tier: { type: 'choice', choice: tier, probabilities: probs, confidence: conf },
  needs_broad_exploration: { type: 'noul', noul: broad },
  asks_for_change: { type: 'noul', noul: change },
} }) });

test('confident answer is returned as-is', async () => {
  const r = await route('grep for FrameStore usages', { config: await cfg(), cwd: '/allowed', fetchImpl: fetchWith({ tier: 'haiku', conf: 0.92, probs: { haiku: 0.9, sonnet: 0.08, opus: 0.02 }, broad: 0.1, change: 0.05 }) });
  assert.equal(r.tier, 'haiku');
  assert.equal(r.confidence, 0.92);
  assert.equal(r.fallback_used, false);
  assert.equal(r.needs_broad_exploration, 0.1);
  assert.equal(r.asks_for_change, 0.05);
  assert.equal(typeof r.latency_ms, 'number');
  assert.deepEqual(r.probabilities, { haiku: 0.9, sonnet: 0.08, opus: 0.02 });
});

test('low confidence falls back to opus for changes and sonnet for questions', async () => {
  const change = await route('implement the thing', { config: await cfg(), cwd: '/allowed', fetchImpl: fetchWith({ tier: 'haiku', conf: 0.4, probs: {}, broad: 0.5, change: 0.9 }) });
  assert.deepEqual([change.tier, change.fallback_used], ['opus', true]);
  const ask = await route('how does X work', { config: await cfg(), cwd: '/allowed', fetchImpl: fetchWith({ tier: 'opus', conf: 0.4, probs: {}, broad: 0.9, change: 0.1 }) });
  assert.deepEqual([ask.tier, ask.fallback_used], ['sonnet', true]);
});

test('Jev failure returns tier null with the reason', async () => {
  const r = await route('x', { config: await cfg(), cwd: '/allowed', fetchImpl: async () => ({ status: 503, text: async () => 'down' }) });
  assert.equal(r.tier, null);
  assert.match(r.error, /http_503/);
});

test('bin: empty brief exits 1; a routed brief prints one JSON line', async () => {
  const run = (args, env, stdinText) => new Promise((resolve) => {
    const p = spawn(process.execPath, [join(toolkitRoot(), 'bin', 'jev-route.mjs'), ...args], { env: { ...process.env, ...env } });
    let out = ''; let err = '';
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => resolve({ code, out, err }));
    p.stdin.end(stdinText);
  });
  const empty = await run([], { JEV_DISABLE: '' }, '   ');
  assert.equal(empty.code, 1);
  assert.match(empty.err, /brief/);
  const dir = await mkdtemp(join(tmpdir(), 'jevrtbin-'));
  const cfgPath = join(dir, 'c.json');
  await writeFile(cfgPath, JSON.stringify({ allowedRoots: [toolkitRoot()], logDir: join(dir, 'logs'), mode: 'replay' }));
  const r = await run([], { JEV_CONFIG: cfgPath, JEV_DISABLE: '' }, 'trace the frame path');
  assert.equal(r.code, 3);
  const parsed = JSON.parse(r.out.trim());
  assert.equal(parsed.tier, null);
  assert.match(parsed.error, /no_recording/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/questions-model-router.test.mjs test/model-router.test.mjs`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the implementations**

`src/questions/model-router.mjs`:
```js
import { noul, choice } from '../client/schema.mjs';

export const version = '1';
export const thresholds = Object.freeze({ confidence: 0.6 });
export const MAX_BRIEF_CHARS = 12000;
export const TIERS = Object.freeze(['haiku', 'sonnet', 'opus']);
// tuned: not yet; criteria derived from the user's routing table, initial floor from spec 7.3.

const TIER_CRITERIA = Object.freeze({
  haiku: 'A narrow lookup: find a file, grep a symbol, list where something is referenced, say which module owns a resource, answer from one or two files without judgement.',
  sonnet: 'Bounded work with a worked example or a clear pattern: trace one field across layers, follow a request through REST and WebSocket paths, write tests for an existing class, copy an established pattern across files, one simple slice inside a larger fan-out, or a build fix.',
  opus: 'Work that needs design judgement: implement a feature slice from a spec, change behaviour across several files with no template to copy, review a diff for correctness, resolve an architectural question, or anything where a wrong first attempt is expensive.',
});

export function buildQuestions() {
  return {
    tier: choice('Which model tier should carry out `brief`?', TIER_CRITERIA),
    needs_broad_exploration: noul('Does `brief` require reading several layers or many files before any answer can be given?', {
      true: 'The brief spans more than one module or layer, or asks how something flows end to end, or the relevant files are not named.',
      false: 'The brief names the file or symbol, or the answer sits in one place.',
    }),
    asks_for_change: noul('Does `brief` ask for code, files, or configuration to be created or modified?', {
      true: 'It asks to add, implement, fix, refactor, write, remove, rename, or configure something.',
      false: 'It asks to explain, find, list, review, compare, or decide, with nothing to be edited.',
    }),
  };
}

export function truncate(state) {
  return { ...state, brief: String(state.brief).slice(0, MAX_BRIEF_CHARS) };
}
```

`src/adapters/model-router/route.mjs`:
```js
import { loadConfig } from '../../client/config.mjs';
import { decide } from '../../client/jev-client.mjs';
import { thresholds } from '../../questions/model-router.mjs';

const AREA = 'model-router';

/** Picks a model tier for a subagent brief; falls back to the heavier tier when Jev is unsure. */
export async function route(brief, opts = {}) {
  const config = opts.config ?? loadConfig();
  const started = Date.now();
  const r = await (opts.decideImpl ?? decide)(AREA, { brief }, { cwd: opts.cwd ?? process.cwd(), sessionId: 'model-router', config, fetchImpl: opts.fetchImpl ?? fetch });
  if (!r.ok) return { tier: null, error: `${r.reason}${r.detail ? `: ${r.detail}` : ''}` };
  const { tier, needs_broad_exploration, asks_for_change } = r.answers;
  const change = asks_for_change.noul;
  const fallback = tier.confidence < thresholds.confidence;
  return {
    tier: fallback ? (change >= 0.5 ? 'opus' : 'sonnet') : tier.choice,
    confidence: tier.confidence,
    probabilities: tier.probabilities,
    needs_broad_exploration: needs_broad_exploration.noul,
    asks_for_change: change,
    fallback_used: fallback,
    latency_ms: Date.now() - started,
  };
}
```

`bin/jev-route.mjs`:
```js
#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { readStdinJson } from '../src/hooks/io.mjs';
import { route } from '../src/adapters/model-router/route.mjs';

async function readStdinText() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

async function main() {
  const { values } = parseArgs({ options: { brief: { type: 'string' } } });
  const brief = (values.brief ? await readFile(values.brief, 'utf8') : await readStdinText()).trim();
  if (!brief) {
    console.error('usage: jev-route [--brief <file>]  (or pipe the brief on stdin); brief is empty');
    return 1;
  }
  const r = await route(brief);
  console.log(JSON.stringify(r));
  return r.tier ? 0 : 3;
}

process.exitCode = await main();
```
Remove the unused `readStdinJson` import before committing.

`skills/model-router/SKILL.md`:
```markdown
---
name: model-router
description: Use before every Agent dispatch to pick the model tier for a subagent brief with Jev; falls back to the routing table when Jev is unavailable.
---

# Model router

Before dispatching a subagent, route the brief:

    printf '%s' "<the brief text>" | node "<toolkit>/bin/jev-route.mjs"

The output is one JSON line: `tier` (`haiku`, `sonnet`, `opus`, or `null`), `confidence`,
`probabilities`, `needs_broad_exploration`, `asks_for_change`, `fallback_used`, `latency_ms`.

Rules:
1. Use `tier` as the `model` for the Agent call. State it in one line when dispatching, for
   example "routing to sonnet (confidence 0.81)".
2. If `fallback_used` is true, say so in that line; the tier came from the fallback rule
   (opus for changes, sonnet for questions), not from a confident choice.
3. If `tier` is `null` (exit code 3), pick the tier from the routing table by hand and say
   "Jev unavailable, table says <tier>".
4. Never upgrade above the returned tier without stating why in the dispatch line.
5. Log nothing yourself; the toolkit writes `logs/model-router.jsonl`.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/questions-model-router.test.mjs test/model-router.test.mjs`
Expected: 6 passing. The bin test's second run uses replay mode with no recordings, so `tier` is null with `no_recording`; that is the expected path on this machine.

- [ ] **Step 5: Commit**

```bash
chmod +x bin/jev-route.mjs
git add src/questions/model-router.mjs src/adapters/model-router bin/jev-route.mjs skills/model-router/SKILL.md test/questions-model-router.test.mjs test/model-router.test.mjs
git commit -m "feat: model router CLI and skill"
```

---

### Task 7: Fixtures for the three new areas

**Files:**
- Create: `fixtures/dynamic-context/cases.jsonl` (20), `fixtures/handback-check/cases.jsonl` (25), `fixtures/model-router/cases.jsonl` (30)
- Test: `test/fixtures-plan2.test.mjs`

**Interfaces:**
- Each line is `{ "state": …, "expected": … }` as `bin/jev-accuracy.mjs` already consumes. Booleans compare to `noul >= 0.5`; strings compare to `choice`.
- dynamic-context state: `{ "prompt": "<text>", "sections": SECTIONS }` where `SECTIONS` is the same array in every case: the ten non-core sections' `{ id, summary }` pairs from Task 2, in file order (`architecture, compose, coroutines, websocket, room, testing, comments, naming, gotchas, git`). `expected` has one boolean per section id, `relevant_<id>`.
- handback-check state: `{ "summary": "<text>", "agent_type": "general-purpose" }`; `expected` has the six claim booleans.
- model-router state: `{ "brief": "<text>" }`; `expected` has `tier` (string) and the two booleans.

- [ ] **Step 1: Write the dynamic-context cases**

Twenty prompts; the relevant set lists the ids expected `true`, all others `false`:

| # | prompt | relevant |
|---|---|---|
| 1 | Add light and dark previews to SocketListScreen | compose, testing |
| 2 | Replace Color.Gray in SocketFrameItemComponent with a theme color | compose |
| 3 | Make createSession suspend and call it from ioScope instead of runBlocking | coroutines, websocket, gotchas |
| 4 | Add a createdAt column to SocketSession with a proper migration | room |
| 5 | Write unit tests for FlowStreamAdapter using a fake Stream | testing, coroutines |
| 6 | Delete the thinking-aloud comments in ChuckerScarletWebSocket | comments, websocket |
| 7 | Rename InspectorDao query methods to follow get/insert/delete naming | naming, room |
| 8 | Why do frames duplicate after pressing Connect twice? | gotchas, websocket |
| 9 | Cancel the MainActivity coroutine scope in onDestroy | coroutines, gotchas |
| 10 | Add a FrameRepository in internal/data and make SocketDetailScreen read from it | architecture, room, compose |
| 11 | Explain how a frame gets from Scarlet into the Room table | websocket, room, architecture |
| 12 | Write the commit message for the migration change | git |
| 13 | Add a stable key to the LazyColumn items in SocketDetailScreen | compose |
| 14 | Decode protobuf payloads for display in the inspector | websocket |
| 15 | Add a DAO test with an in-memory database | testing, room |
| 16 | Batch frame inserts when many arrive within a second | room, coroutines |
| 17 | Which files are public API of the inspector module? | architecture |
| 18 | Add a ViewModel for SocketListScreen and hoist its state | compose, architecture, coroutines |
| 19 | Fix the SQLiteConstraintException when the session was cleared | websocket, gotchas, room |
| 20 | Rename the notification channel constants | naming |

- [ ] **Step 2: Write the hand-back cases**

Twenty-five summaries. Columns are the six expected booleans in the order tests_run, tests_pass, build_ok, tests_added, complete, blocker:

| # | summary | run | pass | build | added | complete | blocker |
|---|---|---|---|---|---|---|---|
| 1 | Implemented FrameRepository and wired SocketDetailScreen to it. Ran :inspector:testDebugUnitTest, 12/12 passing. Build green. | T | T | T | F | T | F |
| 2 | Added FrameRepositoryTest with three cases and made them pass. Compile check passed. | T | T | T | T | T | F |
| 3 | Refactored createSession to suspend. I did not run the tests. | F | F | F | F | T | F |
| 4 | Migration written for version 3. Build fails on a missing import in InspectorDatabase; needs a decision on the converter. | F | F | F | F | F | T |
| 5 | Done. Everything works. | F | F | F | F | T | F |
| 6 | Renamed the DAO methods. Tests were run: 9 passed, 2 failed in SocketDetailScreenTest. | T | F | F | F | F | T |
| 7 | Added previews to SocketListScreen. Skipped the dark preview because UI_MODE_NIGHT_YES is not imported in this module. | F | F | F | F | F | T |
| 8 | Wrote ChuckerScarletWebSocketTest covering open, send, close. All green after two fixes. | T | T | F | T | T | F |
| 9 | Explained the frame path from Scarlet to Room in the report. No files changed. | F | F | F | F | T | F |
| 10 | Implemented batching. Compile check passes. Tests not added because no test source set exists yet. | F | F | T | F | F | T |
| 11 | Cancelled the scope in onDestroy and removed the dead comments. Ran the unit tests, all passing. | T | T | F | F | T | F |
| 12 | Partially done: repository added, screen not yet wired. Stopping for review. | F | F | F | F | F | T |
| 13 | Added stable keys to both LazyColumns. testDebugUnitTest green, assembleDebug green. | T | T | T | F | T | F |
| 14 | Tests added for FlowStreamAdapter; they fail on a timing issue I could not resolve. | F | F | F | T | F | T |
| 15 | The change is complete and the build is green. I was unable to run the instrumented DAO test without a device. | F | F | T | F | T | T |
| 16 | Removed Color.Gray, used colorScheme.onSurfaceVariant. No tests apply. | F | F | F | F | T | F |
| 17 | Blocked: the brief references a FrameStore class that does not exist in this project. | F | F | F | F | F | T |
| 18 | Ran ./gradlew :inspector:compileDebugKotlin successfully; did not run tests since none cover this file. | F | F | T | F | T | F |
| 19 | Implemented and tested. 4 new tests, 16/16 passing, build ok. | T | T | T | T | T | F |
| 20 | I added the migration and bumped the version. Please verify on a device; I could not. | F | F | F | F | T | T |
| 21 | Renamed constants. The lint task reports two warnings I left as-is. | F | F | F | F | T | T |
| 22 | Decoded protobuf for display. Unit tests pass (3/3). One TODO remains for binary frames over 1 MB. | T | T | F | F | F | T |
| 23 | Wrote the commit message as requested. | F | F | F | F | T | F |
| 24 | Ran the full suite: 21 passed, 0 failed. No code changes were needed; the bug was already fixed. | T | T | F | F | T | F |
| 25 | Hoisted state into SocketListViewModel and added SocketListViewModelTest (2 cases, green). Build green. | T | T | T | T | T | F |

- [ ] **Step 3: Write the model-router cases**

Thirty briefs with expected `tier`, `needs_broad_exploration`, `asks_for_change`:

| # | brief | tier | broad | change |
|---|---|---|---|---|
| 1 | Find the file that defines SocketFrame | haiku | F | F |
| 2 | Grep for every call to logFrame | haiku | F | F |
| 3 | Which module owns InspectorNotificationManager? | haiku | F | F |
| 4 | List the routes registered in InspectorComposeActivity | haiku | F | F |
| 5 | What is the current Room database version? | haiku | F | F |
| 6 | Trace how a text frame travels from Scarlet through the decorator into Room and onto the screen | sonnet | T | F |
| 7 | Write unit tests for FlowStreamAdapter following the existing test naming rule | sonnet | F | T |
| 8 | Copy the light/dark preview pattern from SocketListScreen to the other four composables | sonnet | F | T |
| 9 | Fix the compile error in InspectorDatabase after the version bump | sonnet | F | T |
| 10 | Add a stable key to the LazyColumn in SocketDetailScreen, same as in SocketListScreen | sonnet | F | T |
| 11 | Follow the session id from createSession through SessionTracker and the DAO and report where it can diverge | sonnet | T | F |
| 12 | Implement a FrameRepository in internal/data with a Flow API and migrate both screens to it | opus | T | T |
| 13 | Make createSession suspend, remove runBlocking, and restructure the decorator so frame logging never blocks the Scarlet thread | opus | T | T |
| 14 | Review this diff of ChuckerScarletWebSocket for correctness and threading | opus | F | F |
| 15 | Decide whether the inspector should decode protobuf for display or stay payload-agnostic, and write up the trade-offs | opus | T | F |
| 16 | Design and implement a Room migration from version 2 to 3 adding createdAt with a backfill | opus | F | T |
| 17 | Rename the notification channel constants to the naming convention | sonnet | F | T |
| 18 | Where is Color.Gray used? | haiku | F | F |
| 19 | Explain the difference between the ReceiveChannel and Flow based Scarlet interfaces in this app | sonnet | T | F |
| 20 | Add a ViewModel to SocketListScreen and hoist all state and side effects out of the composable | opus | F | T |
| 21 | Run the compile check and report the result | haiku | F | F |
| 22 | Batch frame inserts when more than ten arrive within one second, with tests | opus | F | T |
| 23 | Write a DAO test using an in-memory database for insertFrame and getFramesBySession | sonnet | F | T |
| 24 | Which Gradle plugin versions does the project use? | haiku | F | F |
| 25 | Delete the narration comments in MainActivity | sonnet | F | T |
| 26 | Audit every coroutine scope in both modules and propose an ownership model | opus | T | F |
| 27 | Show me the SocketFrame entity | haiku | F | F |
| 28 | Fix the duplicate Scarlet clients created when Connect is pressed twice | opus | F | T |
| 29 | Add a dark preview to SocketFrameItemComponent | sonnet | F | T |
| 30 | Check whether any composable reads Room directly and list them | sonnet | T | F |

- [ ] **Step 4: Write the failing test**

`test/fixtures-plan2.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { toolkitRoot } from '../src/client/config.mjs';
import { loadRules } from '../src/targets/rules.mjs';

async function cases(area) {
  const text = await readFile(join(toolkitRoot(), 'fixtures', area, 'cases.jsonl'), 'utf8');
  return text.trim().split('\n').map((l) => JSON.parse(l));
}

test('dynamic-context: 20 cases, identical section list matching the shipped rules, one boolean per section', async () => {
  const rules = (await loadRules(join(toolkitRoot(), 'targets', 'websocket-inspector', 'rules'))).filter((r) => !r.always);
  const expectedSections = rules.map((r) => ({ id: r.id, summary: r.summary }));
  const cs = await cases('dynamic-context');
  assert.equal(cs.length, 20);
  for (const c of cs) {
    assert.deepEqual(c.state.sections, expectedSections);
    assert.ok(c.state.prompt.length > 10);
    assert.deepEqual(Object.keys(c.expected).sort(), rules.map((r) => `relevant_${r.id}`).sort());
    assert.ok(Object.values(c.expected).some(Boolean), c.state.prompt);
  }
});

test('handback-check: 25 cases with six booleans each', async () => {
  const cs = await cases('handback-check');
  assert.equal(cs.length, 25);
  for (const c of cs) {
    assert.equal(c.state.agent_type, 'general-purpose');
    assert.deepEqual(Object.keys(c.expected).sort(), ['claims_build_ok', 'claims_complete', 'claims_tests_added', 'claims_tests_pass', 'claims_tests_run', 'reports_blocker']);
    for (const v of Object.values(c.expected)) assert.equal(typeof v, 'boolean');
  }
});

test('model-router: 30 cases, tiers valid, roughly balanced', async () => {
  const cs = await cases('model-router');
  assert.equal(cs.length, 30);
  const count = { haiku: 0, sonnet: 0, opus: 0 };
  for (const c of cs) {
    assert.ok(['haiku', 'sonnet', 'opus'].includes(c.expected.tier));
    count[c.expected.tier] += 1;
    assert.equal(typeof c.expected.needs_broad_exploration, 'boolean');
    assert.equal(typeof c.expected.asks_for_change, 'boolean');
  }
  for (const n of Object.values(count)) assert.ok(n >= 8, JSON.stringify(count));
});

test('no WorkApp text in any plan-2 fixture', async () => {
  for (const area of ['dynamic-context', 'handback-check', 'model-router']) {
    const text = await readFile(join(toolkitRoot(), 'fixtures', area, 'cases.jsonl'), 'utf8');
    assert.equal(/workapp/i.test(text), false, area);
  }
});
```

- [ ] **Step 5: Run the test to verify it fails, then write the three files and verify it passes**

Run: `node --test test/fixtures-plan2.test.mjs`
Expected first: FAIL (files missing). Write the files from the three tables (the dynamic-context `sections` array is built once from the Task 2 summaries and pasted into every line), then rerun.
Expected: 4 passing. Also run `node bin/jev-accuracy.mjs --area handback-check --mode replay` and confirm it prints `skipped 25`, all `no_recording`.

- [ ] **Step 6: Commit**

```bash
git add fixtures/dynamic-context fixtures/handback-check fixtures/model-router test/fixtures-plan2.test.mjs
git commit -m "feat: labeled fixtures for dynamic-context, hand-back, and model-router"
```

---

### Task 8: README, spec amendments, full-suite check

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-09-21-jev-toolkit-design.md`

- [ ] **Step 1: Update README**

Replace the "Status" section with:
```markdown
## Status

Plan 1 done: client, smoke, comment-policy hook, fixtures, accuracy script.
Plan 2 done: WebSocket Inspector target repo, rule sections, `jev-install`, dynamic-context hook,
hand-back check (SubagentStart snapshot + SubagentStop card), model-router CLI and skill, fixtures.
Plan 3 (benchmark runner, reporter, runbook) follows.
```
Add a section after "Dry-run the comment-policy hook":
```markdown
## Install an arm into the target

    node bin/jev-install.mjs --target "/absolute/path/WebSocket Inspector" --arm all-jev

Arms live in `targets/websocket-inspector/arms/`. `jev-install` owns `CLAUDE.md`, `.claude/settings.json`'s
`hooks` key, and the rules folder it writes; it refuses targets outside `allowedRoots`. Switching arms
is one command. The target's `.gitignore` excludes `CLAUDE.md` and `.claude/` so the baseline stays clean.

## Route a brief

    printf '%s' "trace the frame path from Scarlet to Room" | node bin/jev-route.mjs
```
Update the Layout block: add `src/targets     rule loading, CLAUDE.md variants, jev-install` and `skills          model-router SKILL.md`.

- [ ] **Step 2: Amend the spec**

In section 9's table add a row `| room | Room entities, DAO conventions, migrations | `**/data/**/*.kt` |` after `websocket`, and change "these sections" count wording to eleven. In section 8.2 replace the first paragraph with: "Input: `agent_type`, `agent_id`, `model`, `last_assistant_message`, `cwd`. A SubagentStart hook records a content-hash snapshot of the dirty tree per `agent_id`; at SubagentStop the changed set is the difference, so files dirty before the subagent began are not attributed to it. Without a snapshot the check falls back to the dirty tree against HEAD and says `attribution head`." In section 8.2's output paragraph replace `systemMessage` with `additionalContext` and add `attribution <snapshot|head>` to the Facts line. In section 11 remove `toolkitPath` from the config keys (the toolkit path comes from `toolkitRoot()`).

- [ ] **Step 3: Full suite and hygiene**

Run: `node --test`
Expected: all passing, zero failures, pristine output. Then `test ! -d node_modules && node -e "const p=require('./package.json'); if(p.dependencies||p.devDependencies) process.exit(1)" && echo clean` prints `clean`, and `grep -ri workapp targets fixtures skills src bin | wc -l` prints `0`.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-09-21-jev-toolkit-design.md
git commit -m "docs: README and spec updates for plan 2"
```

---

## Self-review against the spec

- **§7.2 hand-back questions:** six Nouls, thresholds 0.8/0.5, code-side flag rules, unverified line (T5). Improvement over spec: snapshot-based attribution via SubagentStart, spec amended in T8.
- **§7.3 router:** Choice over three tiers with criteria derived from the user's routing table, two Nouls, confidence floor 0.6, fallback rule using `asks_for_change` (T6).
- **§7.4 dynamic-context:** one Noul per section over summaries only, threshold 0.5, core always on, token budget, per-session dedupe (T4).
- **§8.2 to 8.4 adapters:** hook events, exclusion of Explore/Plan/claude-code-guide by adapter denylist since matchers are positive regexes, `additionalContext` on SubagentStop per the docs check, router as CLI plus skill because Agent is not a PreToolUse matcher (T4 to T6).
- **§9 target:** gitignore (with `CLAUDE.md` and `.claude/` ignored so the baseline stays pristine), baseline commit and tag, private remote, eleven rule sections written about the real project from the survey, three CLAUDE.md variants, native arm via `paths` frontmatter (T1 to T3). Task prompts for the benchmark are plan 3.
- **§11 portability:** install refuses targets outside `allowedRoots`; rules and settings written idempotently; no new config keys (T3).
- **Type consistency:** `Rule = { id, summary, paths, always, body, file }` from T2 is what T3 installs and T4 loads from the target; `Facts` shape from T5 `collectFacts` is what `flagsFor`/`renderCard` consume; `route` result shape matches the bin and the skill; fixture `expected` keys match each area's question ids exactly.
- **Placeholder scan:** none. Every rule file, arm file, fixture row, and hook output is spelled out.
