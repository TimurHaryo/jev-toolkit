---
id: 05-db-version
category: one-file
gold_sections:
  - room
gold_tier: sonnet
expect_files:
  - "inspector/**/InspectorDatabase.kt"
needs_subagent: false
---
Bump `InspectorDatabase` to version 3 and add an empty `Migration(2, 3)` registered on the builder, keeping `fallbackToDestructiveMigration()` for now. Do not run Gradle.
