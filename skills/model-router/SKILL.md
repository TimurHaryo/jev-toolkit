---
name: model-router
description: Use before every Agent dispatch to pick the model tier for a subagent brief with Jev; falls back to the routing table when Jev is unavailable.
---

# Model router

Before dispatching a subagent, route the brief:

    printf '%s' "<the brief text>" | node "<toolkit>/bin/jev-route.mjs"

The output is one JSON line: `tier` (`haiku`, `sonnet`, `opus`, or `null`), `confidence`,
`probabilities`, `needs_broad_exploration`, `asks_for_change`, `fallback_used`, `latency_ms`.

Rules:
1. Use `tier` as the `model` for the Agent call. State it in one line when dispatching, for
   example "routing to sonnet (confidence 0.81)".
2. If `fallback_used` is true, say so in that line; the tier came from the fallback rule
   (opus for changes, sonnet for questions), not from a confident choice.
3. If `tier` is `null` (exit code 3), pick the tier from the routing table by hand and say
   "Jev unavailable, table says <tier>".
4. Never upgrade above the returned tier without stating why in the dispatch line.
5. Log nothing yourself; the toolkit writes `logs/model-router.jsonl`.
