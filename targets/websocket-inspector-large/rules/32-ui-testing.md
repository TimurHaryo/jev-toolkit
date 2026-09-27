---
id: ui-testing
summary: Compose UI tests with createComposeRule, semantics finders, idling
paths:
  - "**/src/androidTest/**"
  - "**/*ScreenTest.kt"
---
# UI testing with Compose test rules

- Screen tests use `createComposeRule()` and render the stateless screen composable with fake state, not the whole activity. Use `createAndroidComposeRule` only for navigation or permission flows.
- Find nodes by semantics a user would perceive: text, content description, role. Fall back to `testTag` only for elements with no accessible label.
- Test tags are constants in the component file, named `FeatureScreenTags.SubmitButton`, never inline strings.
- Never use `Thread.sleep`. Rely on Compose idling; for custom async work register an `IdlingResource` or use `waitUntil` with a timeout.
- Assert on behaviour: the displayed state after an action and the event sent to the fake ViewModel, not on layout internals.
- Use `mainClock.autoAdvance = false` to test animations deterministically.
- One behaviour per test, named `whenX_showsY`, with the fake state built in the test body.
- Instrumented suites run sharded on CI; keep each test independent of order and device state.
