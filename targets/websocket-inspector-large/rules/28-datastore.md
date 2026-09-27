---
id: datastore
summary: Preferences and Proto DataStore usage, migration from SharedPreferences
paths:
  - "**/datastore/**"
  - "**/*Preferences*.kt"
---
# DataStore and preferences

- New key-value settings use DataStore, not `SharedPreferences`. Small flat settings use Preferences DataStore; structured settings use Proto DataStore with a schema.
- Create exactly one DataStore instance per file, at the top level via `preferencesDataStore` delegate or in a singleton. Two instances on one file corrupt it.
- Wrap each store in a repository that exposes `Flow<Settings>` and suspend setters; UI never touches keys directly.
- Handle `IOException` in the flow with `catch` and emit defaults; rethrow anything else.
- Migrate old `SharedPreferences` with `SharedPreferencesMigration` in the same release that stops reading them.
- Never store large blobs, lists that grow without bound, or relational data in DataStore; that is Room's job.
- Do not call `first()` on the store from the main thread during startup; collect, or read once in a background initializer.
- Test repositories against a store built on a temp file from a JUnit `TemporaryFolder`.
