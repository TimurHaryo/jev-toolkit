---
id: comments
summary: Comment policy: explain why, never what; what is allowed and what is denied
paths:
  - "**/*.kt"
---
# Comments

Default to no comment. Names carry the meaning.

Write a comment only for: a public type's one-line purpose (KDoc); a public function whose purpose is not obvious from its signature (one line on why or what it returns); a genuinely non-obvious block (the reason: workaround, ordering constraint, platform quirk, race, deliberate deviation); an intentionally empty block.

Never write: narration of the next line (`// increment counter`), restatement of the signature in KDoc, section banners, step numbering, commented-out code, or thinking-aloud notes about what the compiler might say. The inspector's decorator has several of the last kind; delete them when you touch that file.
