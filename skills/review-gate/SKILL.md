---
name: review-gate
description: Review the current diff against spec, architecture and quality before commit or PR. Use after finishing a task or before opening a PR.
---

# review-gate

Review the diff (`git diff` + untracked files). Report findings, ordered by severity, one line each: `file:line — problem — fix`.

## Checklist

1. **Spec**: every touched requirement `R#` is implemented and tested; nothing unrequested was added.
2. **Architecture**: dependency rule holds; code sits in the right layer; no cross-feature internals.
3. **Correctness**: edge cases, error paths, null/empty input, concurrency, idempotency.
4. **Security**: no secrets, input validated at the boundary, authz checked, no injection.
5. **Tests**: assert behavior (not implementation), deterministic, cover the named cases.
6. **Readability**: names reveal intent, functions small, no dead code or stray debug output.
7. **Docs**: README/help/ADR/tasks updated when behavior or decisions changed.
8. **Size**: > ~400 changed lines → suggest splitting into reviewable commits/PRs.

## Output

- `Blockers` (must fix), `Should fix`, `Nit`. Say "none" for empty groups.
- End with a verdict: `ready` or `fix first`, and the exact checks you actually ran.

Read-only: report, do not modify files unless the user asks for fixes.
