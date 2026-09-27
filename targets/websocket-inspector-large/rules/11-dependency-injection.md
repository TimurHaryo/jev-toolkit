---
id: dependency-injection
summary: Hilt scopes, bindings modules, qualifiers, and test replacement
paths:
  - "**/di/**"
  - "**/*Module.kt"
---
# Dependency injection

- Modules that adopt Hilt keep bindings in a `di/` package next to the feature, one file per concern (`NetworkModule`, `DatabaseModule`).
- Prefer `@Inject constructor`. Use `@Provides` only for types you do not own (Retrofit, OkHttp, Room builders) and `@Binds` for interface mappings; `@Binds` generates less code.
- Scope deliberately. `@Singleton` is for process-wide, stateful, expensive objects. Repositories are usually unscoped. A scope added "to be safe" is a leak waiting to happen.
- Inject `@ApplicationContext` for long-lived collaborators; never hold an `Activity` context in anything that outlives the screen.
- Use qualifiers (`@IoDispatcher`, `@AuthClient`) instead of two unqualified bindings of one type.
- ViewModels use `@HiltViewModel` and get `SavedStateHandle` injected.
- Tests replace bindings with `@TestInstallIn` modules; shared fakes live in `src/testFixtures`.
- A module without Hilt builds collaborators in one composition root. Do not mix styles inside one feature.
