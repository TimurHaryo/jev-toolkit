---
id: error-handling
summary: Typed errors across layers, user-facing messages, retry affordances
paths:
  - "**/domain/**"
  - "**/*Error*.kt"
---
# Error handling and user-facing messages

- The data layer converts exceptions into a sealed `AppError` (network, unauthorized, not found, validation, unknown). Nothing above it catches raw `IOException`.
- Never catch `CancellationException` without rethrowing it; use `runCatching` only when you rethrow cancellation.
- ViewModels map `AppError` to UI state with a message resource id and an optional retry action; they never hold raw exception messages for display.
- User-facing text says what happened and what to do next ("No connection. Check your network and try again."), never stack traces, codes alone, or "Something went wrong" without an action.
- Offer retry for transient errors, a sign-in prompt for unauthorized, and no retry for validation errors.
- Inline field errors for forms, snackbars for background failures, full-screen states only when the screen has no content.
- Log unexpected errors once, at the boundary where they are mapped, with context; do not log and rethrow at every layer.
