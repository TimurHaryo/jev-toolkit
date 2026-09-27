---
id: push
summary: FCM token handling, notification channels, payloads, POST_NOTIFICATIONS
paths:
  - "**/push/**"
  - "**/*MessagingService.kt"
---
# Push notifications

- One `FirebaseMessagingService` subclass per app. It parses the payload and hands off; no network or database work longer than a few seconds inside `onMessageReceived`.
- Send the FCM token to the backend in `onNewToken` through WorkManager with a network constraint, so a failed upload retries.
- Every notification uses a channel created at startup with a stable id, a translated name, and a deliberate importance. Never post to a channel you have not created.
- On Android 13 and above, request `POST_NOTIFICATIONS` in context, after the user does something that benefits from it, never on first launch.
- Prefer data messages and build the notification locally, so tapping it always opens the right deep link with a fresh back stack.
- Use `PendingIntent.FLAG_IMMUTABLE` unless a mutable intent is required and justified.
- Group bursts with a summary notification, and cancel by tag when the item is read elsewhere.
- Never put personal data in the notification text on the lock screen; set `VISIBILITY_PRIVATE`.
