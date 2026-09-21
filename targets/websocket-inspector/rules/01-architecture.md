---
id: architecture
summary: Layering between :app and :inspector, public vs internal, where new code goes, manual construction instead of DI
paths:
  - "**/*.kt"
---
# Architecture

- `:app` depends on `:inspector`; never the reverse.
- `:inspector` public API is `ChuckerWebSocketFactory`, `ChuckerScarletWebSocket`, `ScarletInspector`, `InspectorLauncher`. New public types need a one-line KDoc and a reason in the change summary.
- `internal/` holds: `InspectorService` and `InspectorNotificationManager` (Android plumbing), `SessionTracker` (process-lifetime cache), `data/` (Room entities, DAO, database), `ui/compose/` (screens and components).
- There is no DI framework. Construct collaborators in one place and pass them down; do not create `ScarletInspector(context)` inside composables or per screen. New screens take a ViewModel or a repository as a parameter.
- Data flow: Scarlet `WebSocket` events → `ChuckerScarletWebSocket` → `InspectorDao` (Room) → `LiveData`/`Flow` → Compose screen. Do not read Room from a composable directly; go through a ViewModel or a small repository class in `internal/data/`.
- Prefer small files with one type each. Split a file that passes 250 lines.
