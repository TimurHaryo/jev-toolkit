---
id: 08-session-tracker-doc
category: comment-heavy
gold_sections:
  - comments
  - websocket
gold_tier: sonnet
expect_files:
  - "inspector/**/SessionTracker.kt"
needs_subagent: false
---
Add a one-line KDoc to each public function in `SessionTracker.kt` that says why it exists, and add an inline comment explaining why the memory cache is checked before the database in `createSession`. Do not run Gradle.
