---
id: accessibility
summary: TalkBack labels, touch targets, contrast ratios, font scaling checks
paths:
  - "**/ui/**/*.kt"
  - "**/components/**"
---
# Accessibility

- Every actionable element has a TalkBack label. Acting icons take `contentDescription` from a string resource; decorative images pass `null`.
- Touch targets are at least 48 by 48 dp; use `Modifier.minimumInteractiveComponentSize()`.
- List rows merge descendants so a row reads as one item; swipe and long-press get custom semantics actions.
- Text contrast is at least 4.5:1, or 3:1 for large text and icons, in both light and dark themes.
- Layouts survive 200 percent font scale: `sp` for text, no fixed heights on text containers, a large-font preview.
- Never convey state by color alone; pair it with an icon, text, or `stateDescription`.
- Section titles use `semantics { heading() }` so users can jump between them.
- Announce async results with a live region or snackbar, not a silent color change.
- Custom controls expose `role` and `toggleableState` so TalkBack announces them.
- Focus follows reading order and returns to the opener when a dialog closes.
- UI tests assert content descriptions on new interactive components.
