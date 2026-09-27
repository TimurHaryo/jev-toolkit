---
id: pull-requests
summary: Pull request template sections, commit message format, branch hygiene
paths:
  - "**/pull_request_template.md"
  - "**/.gitmessage"
---
# Pull request template and commit hygiene

- The PR description follows the template: What, Why, How to test, Screenshots for UI changes, and Risk with a rollback plan.
- Link the issue in the description. A PR without a linked issue needs a sentence saying why.
- Commit subjects use conventional prefixes (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`), imperative mood, under 72 characters.
- Each commit builds and passes tests on its own, so bisect works. Squash fixup and review-response commits before merge.
- Branch names are `type/short-topic`, for example `fix/crash-on-rotation`. Delete the remote branch after merge.
- Rebase on the main branch before requesting review; do not merge the main branch into a feature branch.
- Do not mix formatting-only changes with logic; land them in a separate PR.
- Draft PRs are for early feedback and are not reviewed for approval until marked ready.
- Never force-push after review has started without leaving a comment that explains what changed.
