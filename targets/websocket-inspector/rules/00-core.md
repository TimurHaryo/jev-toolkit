---
id: core
summary: Project overview, module map, build and test commands
always: true
---
# WebSocket Inspector

A personal Compose playground: a sample app (`:app`) that opens two Scarlet WebSocket clients
against one endpoint, and a reusable inspector library (`:inspector`) that decorates Scarlet's
WebSocket to record every frame into Room and shows them in a Compose UI launched from a
persistent notification. Kotlin 1.9.22, AGP 8.6.0, minSdk 23, compileSdk 36. No DI framework.

## Modules

| Module | Namespace | Purpose |
|---|---|---|
| `:app` | `com.example.websocketinspector` | Sample host: `MainActivity` wires two Scarlet clients, `WebSocketFinancialApi` (Flow), `FlowStreamAdapter`, protobuf messages under `app/src/main/proto` |
| `:inspector` | `com.tinder.scarlet.inspector` (code in `com.murphy.scarlet.inspector`) | Library: `ChuckerWebSocketFactory` and `ChuckerScarletWebSocket` decorators, `ScarletInspector` entry point, `internal/` service, notification, Room, Compose screens |

Public surface of `:inspector` is the four top-level files; everything under `internal/` is
implementation and may change freely.

## Build and test

    ./gradlew :app:assembleDebug
    ./gradlew :inspector:compileDebugKotlin        # fastest compile check
    ./gradlew :inspector:testDebugUnitTest         # unit tests (none exist yet; add under src/test)
    ./gradlew :inspector:connectedDebugAndroidTest # Room DAO tests need a device or emulator

## Working rules that always apply

- Read the file you are about to change in full first.
- Keep `:app` a thin sample; behaviour belongs in `:inspector`.
- Do not add dependencies without saying so in the change summary.
