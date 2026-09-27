---
id: room
summary: Room entities, DAO conventions, migrations, and the current destructive-migration caveat
paths:
  - "**/data/**/*.kt"
---
# Room

- Entities: `SocketSession` (id, type, createdAt) and `SocketFrame` (foreign key to session, `Direction`, `Type`, payload, timestamp). Enums are stored by name through type converters.
- `InspectorDatabase` is at version 2 with `fallbackToDestructiveMigration()` and `exportSchema = false`. Any schema change bumps the version and adds a real `Migration`; do not rely on the destructive fallback for a new column.
- DAO queries that feed the UI return `LiveData` today; new queries return `Flow` and are converted with `collectAsState()` in the screen.
- Inserts run on `ioScope`, never on the caller's thread. Batch frame inserts when more than ten arrive within a second.
- Tests for the DAO use `Room.inMemoryDatabaseBuilder` under `androidTest`.
