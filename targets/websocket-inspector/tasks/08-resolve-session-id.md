---
id: 08-resolve-session-id
category: comment-heavy
gold_sections:
  - comments
  - websocket
gold_tier: sonnet
expect_files:
  - "inspector/**/ChuckerScarletWebSocket.kt"
needs_subagent: false
---
In `ChuckerScarletWebSocket.kt`, extract the session-id lookup inside `createSession` into a new private function `resolveSessionId(type: String): String`, and call it from `createSession`. Keep the behaviour identical, including the lookup order. Document the new function with a one-line KDoc saying why it exists, and add one inline comment explaining why the memory cache is checked before the database. Do not run Gradle.
