---
id: 10-frame-repository
category: multi-file
gold_sections:
  - architecture
  - room
  - compose
gold_tier: opus
expect_files:
  - "inspector/**/internal/data/**"
  - "inspector/**/SocketDetailScreen.kt"
needs_subagent: true
---
Introduce `FrameRepository` under `internal/data/` exposing `framesForSession(sessionId): Flow<List<SocketFrame>>`, and make `SocketDetailScreen` read from it instead of touching `ScarletInspector` directly. Dispatch one general-purpose subagent in the foreground to do the implementation, then review its diff. Do not run Gradle.
