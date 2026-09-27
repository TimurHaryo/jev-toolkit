---
id: secure-storage
summary: Secrets handling, Keystore-backed encryption, token storage, no keys in source
paths:
  - "**/security/**"
  - "**/*Crypto*.kt"
---
# Secure storage and secrets

- No API keys, signing passwords, or tokens in source, resources, or `BuildConfig`. Build secrets come from CI environment variables or a local untracked `secrets.properties`.
- Anything shipped in the APK is public. A key that must stay secret belongs on a server, not in the app.
- Auth tokens are encrypted with a key held in Android Keystore (AES-GCM, non-exportable), then written to DataStore. Do not keep tokens in plain `SharedPreferences`.
- Never log tokens, cookies, request bodies with credentials, or personal data, not even in debug builds.
- Mark sensitive screens with `FLAG_SECURE` so they are excluded from screenshots and the recents preview.
- Set `android:allowBackup="false"` or explicit backup rules that exclude credential stores.
- Clear credentials, caches, and database rows tied to the user on logout, in one `SessionCleaner` so nothing is missed.
- Handle `KeyPermanentlyInvalidatedException` by clearing the stored secret and asking the user to sign in again.
- Use `SecureRandom` for nonces and ids; never `Random` or timestamps.
