---
id: 04-cancel-scope
category: one-file
gold_sections:
  - coroutines
  - gotchas
gold_tier: sonnet
expect_files:
  - "app/**/MainActivity.kt"
needs_subagent: false
---
`MainActivity` creates a coroutine scope that is never cancelled. Cancel it in `onDestroy` and remove the comment-only body that is there now. Do not run Gradle.
