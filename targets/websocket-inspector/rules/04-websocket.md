---
id: websocket
summary: Scarlet decorator design, frame model, session reuse, protobuf adapters, what to update when frame logging changes
paths:
  - "**/Chucker*.kt"
  - "**/SessionTracker.kt"
  - "**/*Api.kt"
  - "**/*StreamAdapter.kt"
---
# WebSocket layer

- `ChuckerWebSocketFactory` wraps the delegate factory only in debug builds; `ChuckerScarletWebSocket` intercepts `open`, `send`, and `close` and records frames. Keep the decorator transparent: every delegate call happens exactly once, in the same order, with the same arguments.
- Frames are `SocketFrame(sessionId, direction, type, payload, timestamp)`. Text frames store the string; binary frames store base64 via `okio.ByteString`. Do not decode protobuf for display in the inspector; the sample app owns protobuf.
- Session reuse: `SessionTracker` keeps `type → sessionId` for the process lifetime so reconnects stay in one session. The lookup order is memory cache, then DB, then create. Keep that order.
- Frame logging must survive a cleared session: on `SQLiteConstraintException` recreate the session once and retry once; then log and drop.
- The sample app's two clients (`Financial`, `Trading`) share one `OkHttpClient`. Do not create a second `OkHttpClient`; do not call `setupScarlet()` twice without tearing the first instance down.
- Protobuf classes are generated from `app/src/main/proto`; the copies in `example/` are not on the build path.
