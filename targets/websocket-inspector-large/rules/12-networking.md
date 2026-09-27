---
id: networking
summary: OkHttp client sharing, timeouts, retry and backoff policy, auth refresh
paths:
  - "**/network/**"
  - "**/*Interceptor.kt"
---
# Networking and retry policy

- One shared `OkHttpClient` per process; derive variants with `newBuilder()` so pools and caches are shared.
- Default timeouts: connect 10 s, read and write 20 s. Uploads get a derived client with explicit values.
- Retries live in one interceptor, never at call sites. Retry only idempotent methods, and only on connection failures, 408, 429, and 5xx. POST retries need an `Idempotency-Key` header.
- Backoff is exponential with full jitter: base 500 ms, factor 2, cap 8 s, at most 3 attempts. Honour `Retry-After`, capped at 30 s.
- Other 4xx responses are not retried; map them to a typed failure. Raw `HttpException` never escapes the data layer.
- Token refresh goes through an OkHttp `Authenticator` behind a mutex, so concurrent 401s refresh once.
- Logging interceptors run at `BASIC` in debug only, with auth headers redacted.
- Certificate pinning, if used, pins two keys so rotation never bricks old builds.
- Offline is a normal state: serve cached data with a banner and queue writes with WorkManager.
