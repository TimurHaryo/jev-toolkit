---
id: 11-suspend-create-session
category: multi-file
gold_sections:
  - coroutines
  - websocket
  - gotchas
gold_tier: opus
expect_files:
  - "inspector/**/ChuckerScarletWebSocket.kt"
  - "inspector/**/SessionTracker.kt"
needs_subagent: true
---
Make `createSession` in `ChuckerScarletWebSocket` a `suspend` function, remove every `runBlocking`, and call it from `ioScope` so no Scarlet callback thread blocks. Dispatch one general-purpose subagent in the foreground to do the implementation, then review its diff. Do not run Gradle.
