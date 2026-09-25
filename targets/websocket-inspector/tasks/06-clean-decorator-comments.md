---
id: 06-clean-decorator-comments
category: comment-heavy
gold_sections:
  - comments
  - websocket
gold_tier: sonnet
expect_files:
  - "inspector/**/ChuckerScarletWebSocket.kt"
needs_subagent: false
---
`ChuckerScarletWebSocket.kt` contains thinking-aloud and narration comments. Remove every comment that narrates the code or speculates about the compiler; keep only comments that state a reason. Change no code. Do not run Gradle.
