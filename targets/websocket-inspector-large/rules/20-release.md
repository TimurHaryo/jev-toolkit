---
id: release
summary: Release trains, semantic versioning, versionCode scheme, staged rollout, hotfixes
paths:
  - "**/app/build.gradle.kts"
  - "**/CHANGELOG.md"
---
# Release process and versioning

- Releases ship on a two-week train. The release branch is cut on Monday of week two; only fixes for release blockers are cherry-picked after the cut.
- `versionName` follows semantic versioning (`MAJOR.MINOR.PATCH`). `versionCode` is derived as `major * 10000 + minor * 100 + patch` and must always increase.
- Never edit versions by hand on a feature branch; the release job bumps them and tags the commit `vX.Y.Z`.
- Every user-facing change adds a line under `Unreleased` in `CHANGELOG.md` in the same pull request.
- Production rollout is staged: 1 percent, 10 percent, 50 percent, then full, with at least 24 hours between steps. Halt if the crash-free user rate drops below 99.5 percent.
- A hotfix branches from the release tag, bumps `PATCH`, and is merged back to the main branch the same day.
- Release builds are signed only in CI. Signing keys never leave the CI secret store.
- Keep the mapping file for every release so obfuscated stack traces can be retraced.
