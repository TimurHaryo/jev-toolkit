---
id: image-loading
summary: Coil image loader setup, sizing, memory and disk cache, placeholders
paths:
  - "**/image/**"
  - "**/*Image*.kt"
---
# Image loading and caching

- All remote images load through one Coil `ImageLoader` built at startup and shared; do not create loaders per screen.
- The loader shares the app's `OkHttpClient`, so auth, timeouts, and interceptors apply to image requests too.
- Memory cache is 20 percent of available memory; disk cache is 250 MB in the app cache directory.
- Always let Coil size to the target. In Compose use `AsyncImage` with a fixed or constrained size so it does not decode full-resolution bitmaps.
- Every image has a placeholder and an error drawable from the design system, sized like the final image so layouts do not jump.
- Prefer server-side resizing: request the width you display through URL parameters when the backend supports it.
- Use `crossfade` sparingly (list thumbnails off, hero images on) to keep scrolling smooth.
- Clear image caches in the logout cleaner when images can contain user content.
- Tests swap in a fake `ImageLoader` that returns a solid color drawable instantly.
