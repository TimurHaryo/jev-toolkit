---
id: static-analysis
summary: Android Lint, detekt, ktlint rules, baseline files, suppression policy
paths:
  - "**/lint.xml"
  - "**/detekt*.yml"
---
# Static analysis and lint baselines

- Android Lint, detekt, and ktlint run on every pull request. Warnings on changed lines fail the check.
- Baseline files (`lint-baseline.xml`, `detekt-baseline.xml`) exist only to freeze legacy findings. Never regenerate a baseline to hide new issues; the file may only shrink.
- Fixing a baselined issue in code you touch is expected, and the baseline entry is removed in the same change.
- Suppress a finding only at the narrowest scope (`@Suppress` on one declaration, never on a file) and add a short written reason next to it.
- Formatting is ktlint's job. Do not argue style in review; run `./gradlew ktlintFormat` before pushing.
- New detekt rules land with the baseline updated in a separate, reviewed change so feature diffs stay readable.
- Treat `NewApi`, `MissingPermission`, and `UnsafeOptInUsageError` lint findings as errors, never baseline them.
- Custom lint checks for project conventions live in a `:lint-rules` module with their own unit tests.
