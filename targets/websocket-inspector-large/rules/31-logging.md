---
id: logging
summary: Timber logging levels, Crashlytics breadcrumbs and non-fatals, redaction
paths:
  - "**/logging/**"
  - "**/*Logger.kt"
---
# Logging and crash reporting

- Log through Timber only. Debug builds plant a `DebugTree`; release builds plant a tree that forwards warnings and errors to Firebase Crashlytics and drops the rest.
- Levels: `d` for developer detail, `i` for lifecycle milestones, `w` for recoverable problems, `e` for failures that need a look. Do not log at `e` for expected states like offline.
- Report caught but unexpected exceptions with `recordException` as non-fatals, once, at the boundary that handles them.
- Add breadcrumbs for navigation and key user actions so crashes carry the path that led to them. Breadcrumbs never contain personal data.
- Set a pseudonymous user id in Crashlytics, never an email or phone number.
- No `println` or `Log.*` calls in production code; lint flags them.
- Tag logs by class through Timber defaults; do not hand-write tag constants in every file.
- Never log inside tight loops or per frame; aggregate and log a summary.
- Upload mapping files from CI for every release so stack traces are readable.
