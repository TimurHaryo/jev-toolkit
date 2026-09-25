# First contact: smoke test and hooks check

Purpose: prove that Jev and every hook work on this device before spending on a benchmark run.
Everything here is small: cents of API spend, under ten minutes. Run the steps in order and stop
at the first failure; send the output back at the end (section 6).

## 1. Prerequisites

- Node 20 or newer: `node --version`
- Claude Code CLI: `claude --version`
- git, and both repos cloned side by side:

      git clone https://github.com/TimurHaryo/jev-toolkit.git
      git clone https://github.com/TimurHaryo/websocket-inspector.git

- A TypeSafe key for Jev.
- Any provider that exposes an Anthropic-compatible base URL (DeepSeek does; a relay
  subscription may). This brief never names a model: the names come from the provider block you
  configure in step 2.

## 2. Configure

From the `jev-toolkit` checkout:

    cp jev.config.example.json jev.config.json

Edit `jev.config.json`:

1. `allowedRoots`: the absolute path of your `websocket-inspector` clone, in quotes.
2. `activeProvider`: the name of the provider block you will use.
3. The provider block itself. `deepseek` is already there. To add another provider, copy the
   block and change these fields:

       "myprovider": {
         "baseUrl": "https://<anthropic-compatible endpoint>",
         "authHeader": "bearer",
         "authTokenEnv": "MYPROVIDER_API_KEY",
         "models": { "opus": "<strong model>", "sonnet": "<mid model>", "haiku": "<cheap model>", "subagent": "<mid model>" },
         "pricing": { "<strong model>": { "input": 0, "output": 0, "cache_read": 0, "cache_write": 0 } }
       }

   `authHeader` is `bearer` for almost every relay and `x-api-key` only for native Anthropic.
   Prices are USD per million tokens; zeros are fine for the hooks check, fill them before a
   benchmark run.
4. Leave `logDir` as `logs` and `benchmark.isolateClaudeConfig` as `true`.

Export the keys in the shell you will use (the variable name for the provider is whatever you
put in `authTokenEnv`):

    export TYPESAFE_API_KEY=...
    export DEEPSEEK_API_KEY=...        # or MYPROVIDER_API_KEY=...

Confirm the target is at its baseline:

    git -C "<websocket-inspector path>" tag        # must print jev-baseline
    git -C "<websocket-inspector path>" status     # must be clean

## 3. Smoke test (Jev only, no LLM)

    node bin/jev-smoke.mjs

PASS prints three answers, the resolved `mode`, and your `allowedRoots`. FAIL prints a block
headed `PASTE THIS BACK`; stop here and send that block.

## 4. Hooks check (four tiny sessions)

Run this from a plain terminal, not from inside a Claude Code session. It resets the target to
`jev-baseline` before and after, which discards any uncommitted change in that clone.

    node bin/jev-hooks-check.mjs --target "<websocket-inspector path>" --yes-reset

Expected: eight lines, all starting with `PASS`:

    PASS dynamic-context hook fired
    PASS dynamic-context Jev call ok
    PASS comment-policy hook fired
    PASS comment-policy Jev call ok
    PASS hand-back card produced
    PASS hand-back card has facts
    PASS comment-policy llm hook fired
    PASS comment-policy llm judge ok

Exit code 0 means all passed, 2 means at least one FAIL, 3 means it refused to start (the
message says why: path not under `allowedRoots`, missing tag, missing key, missing config).

## 5. If something fails

| Symptom | Likely cause | What to try |
|---|---|---|
| `refused: ... allowedRoots` | path in config differs from the clone path | use the absolute path exactly as `pwd` prints it inside the clone |
| `refused: tag jev-baseline is missing` | tags not fetched | `git -C "<path>" fetch --tags` |
| `refused: <VAR> is not set` | key not exported in this shell | export it and rerun |
| a session ends immediately with a login or onboarding error | isolated config dir has no login state | set `benchmark.isolateClaudeConfig` to `false` in the config and rerun |
| `FAIL ... hook fired` with `no line with sessionId` | the hook never ran; provider or Claude Code refused the session | send the output; check `logs/*.jsonl` for `skipped` lines and their `reason` |
| `FAIL ... Jev call ok` with a reason | Jev reachable but the call failed (`timeout`, `http_401`, `no_api_key`) | send the reason |
| `FAIL comment-policy llm judge ok` | the judge session could not start under the hook | send the output; this is the finding I most expect on first contact |

Do not edit the toolkit code on this device; send the output and I will fix from here.

## 6. What to send back

Paste as text, not screenshots:

1. The full output of `node bin/jev-smoke.mjs`.
2. The full output of the hooks check, including the exit code (`echo $?` right after).
3. If anything failed: the last 20 lines of each file under `logs/` that changed during the run:

       tail -n 20 logs/*.jsonl

None of this contains keys. Session ids, hook names, and probabilities are all it shows.

## 7. If everything passed

You do not need to wait. Continue with RUNBOOK.md section 6 at one repetition, then send the
sanity-step numbers from section 6 of the runbook when it finishes.
