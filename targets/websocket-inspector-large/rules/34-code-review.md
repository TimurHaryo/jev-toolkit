---
id: code-review
summary: Code review expectations, turnaround time, blocking vs nit comments
paths:
  - "**/CODEOWNERS"
  - "**/.github/**"
---
# Code review expectations

- Every change needs one approval from a code owner of each touched area. Changes to build logic, security, or release config need two.
- First review within one working day. If you cannot review in time, say so and hand it off.
- Review for correctness, readability, tests, and fit with these conventions. Style is the formatter's job.
- Prefix comments: `blocking:` for must-fix, `nit:` for optional, `question:` for understanding. Unprefixed comments are treated as blocking.
- The author resolves a thread only after addressing it; the reviewer resolves `question:` threads.
- Keep changes reviewable: under 400 changed lines of production code where possible. Split refactors from behaviour changes.
- Reviewers run the change locally when it touches UI or navigation, and check both themes.
- Approve with suggestions when the only remaining comments are nits; do not hold a change for taste.
- Disagreements that go past two rounds move to a short call, with the outcome written back in the thread.
