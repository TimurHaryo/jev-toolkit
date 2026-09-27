---
id: modularization
summary: Feature and core modules, allowed dependency directions, API surfaces
paths:
  - "**/settings.gradle.kts"
  - "**/feature/**"
  - "**/core/**"
---
# Modularization and module boundaries

- Modules come in three kinds: `:app` (wiring only), `:feature:*` (one user-facing flow each), and `:core:*` (shared infrastructure such as network, database, design system).
- Dependencies point one way: app to feature to core. A feature module never depends on another feature module; shared code moves to a core module instead.
- Cross-feature navigation goes through route contracts in `:core:navigation`, not through direct class references.
- Each module exposes a small public API. Everything else is `internal`; review any new public declaration in a core module.
- A new module needs a reason in the pull request: build time, ownership, or reuse. Do not split for its own sake.
- Keep modules buildable and testable in isolation; a feature's unit tests must not need `:app`.
- Resources shared across features live in the design system module, prefixed to avoid merge clashes.
- A dependency graph check in CI fails the build when an illegal edge appears.
