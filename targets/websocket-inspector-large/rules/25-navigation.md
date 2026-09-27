---
id: navigation
summary: Navigation Compose routes, typed arguments, deep links, back stack rules
paths:
  - "**/navigation/**"
  - "**/*NavGraph.kt"
---
# Navigation and deep links

- Routes are typed: each destination is a serializable class or object, and arguments are properties on it. No string routes built by concatenation.
- Pass ids, not objects. A destination loads its own data from the repository using the id argument.
- Each feature exposes one `NavGraphBuilder` extension that registers its destinations; `:app` composes the graphs.
- Deep links are declared on the destination and documented in the feature README with an example URI. Test each one with `adb shell am start -d`.
- Validate deep link arguments; an unknown or malformed id lands on a friendly error state, never a crash.
- After login or onboarding, clear the back stack with `popUpTo` inclusive so Back does not return to the auth flow.
- Avoid navigating from inside a composable's body; navigate in response to events collected in a `LaunchedEffect` or a click handler.
- Screen-level ViewModels are scoped to their navigation entry; shared flow state uses a parent graph entry.
