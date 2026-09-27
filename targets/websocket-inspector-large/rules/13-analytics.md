---
id: analytics
summary: Analytics event naming in object_action snake_case, parameters, consent
paths:
  - "**/analytics/**"
  - "**/*Tracker.kt"
---
# Analytics event naming

- Event names are `object_action` in lower snake_case, past tense for completed actions: `order_submitted`, `filter_applied`, `screen_viewed`.
- Names stay under 40 characters; at most 25 parameters per event, snake_case keys, primitive values only.
- Every event is declared once in a typed catalog (`sealed interface AnalyticsEvent`). Call sites never pass raw string names.
- The tracking plan is the source of truth. A new event needs a plan entry and a reviewer from the owning area.
- Never send personal data: no emails, phone numbers, free text, precise location, or backend ids. Bucket values when a range is enough.
- Every dispatcher is gated on consent. Events raised before consent is known are dropped, not buffered.
- Screen views are logged once per destination change from the navigation layer, not per screen.
- Tests assert on typed events sent to a fake tracker.
- Renaming an event breaks dashboards: ship the new one, keep the old for one release, then remove it.
