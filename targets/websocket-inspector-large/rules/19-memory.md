---
id: memory
summary: Leak hunting with LeakCanary, lifecycle-safe references, bitmap and cache limits
paths:
  - "**/*Activity.kt"
  - "**/*Fragment.kt"
---
# Memory and leak hunting

- LeakCanary runs in every debug build. A reported leak is a bug with the same priority as a crash; do not dismiss it as a library quirk without a linked issue.
- Never keep an `Activity`, `Fragment`, `View`, or composable lambda in a singleton, companion object, or static field.
- Listeners and callbacks registered in `onStart` are removed in `onStop`. Prefer lifecycle-aware APIs (`repeatOnLifecycle`, `DisposableEffect`) so cleanup is automatic.
- Coroutines launched from UI use `lifecycleScope` or `viewModelScope`, never `GlobalScope`.
- In-memory caches are bounded (`LruCache` sized in bytes) and cleared in `onTrimMemory` at `TRIM_MEMORY_UI_HIDDEN` or above.
- Decode bitmaps at display size through the image loader; never load a full-resolution photo into memory to show a thumbnail.
- Fragments null out view binding in `onDestroyView`.
- Investigate growth with the Android Studio memory profiler and a heap dump, comparing the retained size before and after repeating the suspected flow five times.
