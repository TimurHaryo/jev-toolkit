---
id: background-work
summary: WorkManager workers, constraints, unique work, backoff, expedited jobs
paths:
  - "**/*Worker.kt"
  - "**/work/**"
---
# Background work with WorkManager

- Deferrable, guaranteed work uses WorkManager. Do not use `AlarmManager`, bare services, or long-lived coroutines for uploads and syncs.
- Workers extend `CoroutineWorker`, are small, and delegate to a repository. Inject dependencies through a `WorkerFactory` (or `@HiltWorker`).
- Enqueue with `enqueueUniqueWork` and an explicit `ExistingWorkPolicy`, so repeated triggers do not stack duplicate jobs.
- Declare constraints (network type, battery not low, storage not low) instead of checking them inside `doWork`.
- Return `Result.retry()` for transient failures with exponential backoff starting at 30 s; return `Result.failure()` for permanent ones.
- Keep `doWork` under ten minutes. Split long jobs into chained workers that pass small `Data` payloads; large data goes to a file or database row.
- Use expedited work only for short, user-initiated tasks, with a foreground info fallback.
- Test workers with `TestListenableWorkerBuilder` and `WorkManagerTestInitHelper`.
