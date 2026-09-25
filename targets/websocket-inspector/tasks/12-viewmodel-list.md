---
id: 12-viewmodel-list
category: multi-file
gold_sections:
  - compose
  - architecture
  - coroutines
gold_tier: opus
expect_files:
  - "inspector/**/ui/**"
needs_subagent: true
---
Add `SocketListViewModel` that owns the session list state and the delete action, and hoist all state and side effects out of `SocketListScreen` into it. Dispatch one general-purpose subagent in the foreground to do the implementation, then review its diff. Do not run Gradle.
