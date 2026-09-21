---
id: naming
summary: File, class, composable, Room, and resource naming
paths:
  - "**/*.kt"
  - "**/res/**"
---
# Naming

- One top-level type per file, file named after the type.
- Composables: `PascalCase` nouns for screens (`SocketListScreen`) and components (`SocketFrameItemComponent`); `on<Event>` for callbacks; `<Name>State` for hoisted state classes.
- Room: entities are nouns (`SocketFrame`), DAO is `InspectorDao`, queries read `get<Thing>By<Key>`, mutations `insert<Thing>` / `delete<Thing>`.
- Decorators keep the delegate's name plus a prefix (`ChuckerScarletWebSocket` wraps a Scarlet `WebSocket`).
- Resources: `ic_` icons, `notification_` channels and ids as constants in the notification manager, string keys section-prefixed (`inspector_title_sessions`).
- Constants `UPPER_SNAKE_CASE` in a `companion object` or top-level `private const val`.
