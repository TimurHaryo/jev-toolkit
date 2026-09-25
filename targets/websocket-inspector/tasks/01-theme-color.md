---
id: 01-theme-color
category: one-file
gold_sections:
  - compose
gold_tier: sonnet
expect_files:
  - "inspector/**/SocketFrameItemComponent.kt"
needs_subagent: false
---
In `SocketFrameItemComponent.kt`, replace the hardcoded `Color.Gray` with the matching `MaterialTheme.colorScheme` token and keep the visual weight the same. Do not run Gradle.
