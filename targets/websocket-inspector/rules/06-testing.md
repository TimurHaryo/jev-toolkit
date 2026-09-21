---
id: testing
summary: Test layout, naming, what to test per layer, and the libraries actually declared
paths:
  - "**/src/test/**"
  - "**/src/androidTest/**"
---
# Testing

- Unit tests live under `src/test/kotlin` mirroring the main package. Instrumented tests under `src/androidTest/kotlin`.
- Declared libraries: JUnit 4, `androidx.test.ext:junit`, Espresso, Compose `ui-test-junit4` for `:inspector`. Adding MockK or `kotlinx-coroutines-test` is allowed but must be stated in the change summary.
- Test names read `subject_condition_expectation`, for example `createSession_existingTypeInCache_reusesSessionId`.
- Test the decorator by wrapping a fake `WebSocket` and asserting delegate calls and recorded frames; test `FlowStreamAdapter` with a fake `Stream`; test the DAO in memory; test composables with `createComposeRule` and semantics, not screenshots.
- Every bug fix adds the test that would have caught it.
