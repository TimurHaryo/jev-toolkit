---
id: 02-lazy-keys
category: one-file
gold_sections:
  - compose
gold_tier: sonnet
expect_files:
  - "inspector/**/SocketDetailScreen.kt"
needs_subagent: false
---
Give the `LazyColumn` in `SocketDetailScreen.kt` a stable `key` for its items using the frame id. Do not run Gradle.
