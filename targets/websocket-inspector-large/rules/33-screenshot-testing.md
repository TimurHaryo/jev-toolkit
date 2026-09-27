---
id: screenshot-testing
summary: Screenshot tests with Paparazzi or Roborazzi, golden updates, review
paths:
  - "**/src/test/**/*Screenshot*.kt"
  - "**/snapshots/**"
---
# Screenshot testing

- Design system components and key screen states have JVM screenshot tests (Paparazzi or Roborazzi). They run in the unit test task, not on emulators.
- Each test renders one state per preview parameter: light and dark theme, default and largest font scale, and one RTL locale.
- Use fixed fake data and a fixed clock so images are deterministic. No network images; use the fake image loader.
- Golden images live next to the tests under version control. Record new goldens with the record task, never by copying from a failed run.
- A pull request that changes goldens must explain the visual change and include before and after images in the description.
- The comparison threshold stays at the tool default. Raising it to make a flaky test pass hides real regressions.
- Keep one screenshot test per meaningful state, not per pixel of variation; a hundred near-duplicate goldens slow down every review.
- Delete goldens in the same change that deletes the component they cover.
