---
id: localization
summary: String resources, plurals, placeholders, RTL layout, translation workflow
paths:
  - "**/res/values*/**"
  - "**/strings*.xml"
---
# Localization and string resources

- Every user-visible string lives in `res/values/strings.xml`. No literals in composables, toasts, or notifications, even for debug-only screens that ship.
- Name keys `feature_screen_purpose` (`checkout_summary_title`), never by their English text.
- Use positional placeholders (`%1$s`, `%2$d`) so translators can reorder them. Never build sentences by concatenating resources.
- Counts use `<plurals>` with `pluralStringResource`; do not branch on `count == 1` in code.
- Add `translatable="false"` to brand names and format strings, and a `<!-- -->` note for translators when context is ambiguous.
- Layouts use `start`/`end`, never `left`/`right`. Directional icons set `autoMirrored`. Check every new screen with a forced RTL preview.
- Dates, numbers, and currency go through locale-aware formatters; never hand-format with string templates.
- New strings merge in English only; translations arrive through the translation export. Do not edit translated files by hand.
- Remove unused strings in the change that stops using them; lint's `UnusedResources` runs in CI.
