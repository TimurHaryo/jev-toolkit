---
id: gradle
summary: Gradle Kotlin DSL, version catalog, convention plugins, build speed
paths:
  - "**/*.gradle.kts"
  - "**/libs.versions.toml"
---
# Gradle build conventions

- All build scripts use the Kotlin DSL. Dependency coordinates and versions live only in `gradle/libs.versions.toml`; no version strings in module scripts.
- Shared configuration (compile SDK, Kotlin options, lint setup) lives in convention plugins under `build-logic/`, not in `subprojects {}` or copy-pasted blocks.
- Use `implementation` by default and `api` only when a type appears in the module's public signatures.
- Keep configuration cache compatible: no `project` access at execution time, no eager `tasks.create`; register tasks lazily with `tasks.register`.
- Do not add a repository to a single module; repositories are declared once in `settings.gradle.kts`.
- Upgrade AGP, Kotlin, and Gradle in dedicated pull requests, one tool at a time, with the release notes linked.
- Annotation processing uses KSP where the library supports it; kapt is only for libraries without KSP support.
- Build scan or profile before and after any change that claims to speed up the build.
