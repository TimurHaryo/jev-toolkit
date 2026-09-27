---
id: gotchas
summary: Known symptom, cause, fix table for this project
paths:
  - "**/*.kt"
---
# Gotchas

| Symptom | Cause | Fix |
|---|---|---|
| App stalls or ANR when a socket opens | `runBlocking` inside `createSession` on Scarlet's callback thread | make the lookup `suspend`, call from `ioScope` |
| `SQLiteConstraintException: FOREIGN KEY constraint failed` while logging frames | session rows cleared while the socket is open | recreate the session once, retry once, then drop and log |
| Duplicate frames after pressing Connect again | `setupScarlet()` builds new Scarlet instances without closing the old ones | keep one instance per type; tear down before rebuilding |
| Coroutines keep running after the sample activity closes | `MainActivity` scope is never cancelled | cancel in `onDestroy` |
| All recorded frames vanish after an update | `fallbackToDestructiveMigration()` at a version bump | write a `Migration` |
| Protobuf edits have no effect | edited the copies in `example/`, not `app/src/main/proto` | edit under `app/src/main/proto` |
| Compose preview renders no theme | screen not wrapped in `MaterialTheme` in the preview | wrap it |
