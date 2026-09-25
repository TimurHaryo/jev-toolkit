---
id: 09-frame-batching-comments
category: comment-heavy
gold_sections:
  - coroutines
  - room
  - comments
  - websocket
gold_tier: opus
expect_files:
  - "inspector/**/ChuckerScarletWebSocket.kt"
needs_subagent: false
---
Add a small buffer to `logFrame` so frames arriving within 200 ms are inserted in one batch on `ioScope`. Comment the buffer only where a reader would otherwise ask why. Do not run Gradle.
