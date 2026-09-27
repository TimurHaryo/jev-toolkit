---
id: compose
summary: Compose rules for the inspector UI: theme tokens, previews, list layout, state hoisting
paths:
  - "**/ui/**/*.kt"
---
# Compose

- Colors and typography come from `MaterialTheme.colorScheme` and `MaterialTheme.typography`. Never write `Color.Gray` or a literal `Color(0x…)` in a screen or component; `SocketFrameItemComponent` has one such literal to fix when touched.
- Every new composable ships two previews: `@Preview(name = "light")` and `@Preview(name = "dark", uiMode = UI_MODE_NIGHT_YES)`, wrapped in `MaterialTheme`.
- `LazyColumn` never sits inside a vertically scrollable parent. Inside a `Column`, give it `Modifier.weight(1f)`. Always pass a stable `key` to `items`.
- Hoist state: a screen receives state and callbacks; it does not create repositories or launch coroutines on `Dispatchers.IO` itself. Existing screens do this for MVP parity; do not copy the pattern into new screens.
- Navigation routes are string constants in `InspectorComposeActivity`; add new routes there and pass arguments through the route, not through singletons.
- `textAlign` on `Text` needs a width larger than the content; use `fillMaxWidth()` or align the parent.
