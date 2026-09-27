---
id: feature-flags
summary: Feature flag registry, remote config defaults, kill switches, flag cleanup
paths:
  - "**/flags/**"
  - "**/*Flag*.kt"
---
# Feature flags

- Every flag is declared in one typed registry with a key, a default, an owner, and a removal date. A flag without an owner or a date fails review.
- Defaults are the safe, shipped behaviour. The app works fully offline on defaults; remote config only overrides.
- Read flags through an injected `FeatureFlags` interface, never the vendor SDK. Tests use an in-memory fake.
- Fetch remote values off the main thread at startup. UI-shaping flags activate on the next cold start; kill switches activate immediately.
- Kill switches are boolean, default to "on", and are checked at the feature's entry point.
- Evaluate a flag once per screen session and pass the value down, so UI does not flip mid-flow.
- Do not nest flags at call sites; encode dependencies in the registry.
- Log exposure once per session per flag so experiment analysis has a clean denominator.
- Remove a flag within two releases of full rollout: the dead branch, the registry entry, and the remote key go in one change.
