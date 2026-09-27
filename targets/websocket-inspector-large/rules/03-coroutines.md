---
id: coroutines
summary: Coroutine and Flow rules: scopes, dispatchers, no runBlocking on callback threads, Flow adapters
paths:
  - "**/inspector/*.kt"
  - "**/internal/*.kt"
  - "**/app/src/**/*.kt"
---
# Coroutines and Flow

- Database writes go through `ScarletInspector.ioScope` (SupervisorJob + Dispatchers.IO). Do not create ad hoc `CoroutineScope(Dispatchers.IO)` in screens or decorators.
- Never call `runBlocking` on a Scarlet callback thread. `ChuckerScarletWebSocket.createSession` does this today; when you touch it, make the DB lookup suspend and call it from `ioScope`.
- Dispatchers are constructor parameters with defaults (`io: CoroutineDispatcher = Dispatchers.IO`) so tests can inject `StandardTestDispatcher`.
- Scarlet streams are exposed as `Flow` through `FlowStreamAdapter`; new APIs return `Flow<T>`, not `ReceiveChannel` (the `EchoService` channel example is legacy).
- Cancel scopes you own. `MainActivity` creates a `Dispatchers.Main + Job()` scope and never cancels it; fix when touched.
- Catch specific exceptions at the boundary (`SQLiteConstraintException` in frame logging), log them with the frame id, and never swallow silently.
