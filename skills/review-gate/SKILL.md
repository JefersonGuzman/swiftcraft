---
name: review-gate
description: Review the current diff against the specs, architecture and quality before commit or PR. Use after finishing a task or before opening a PR.
---

# review-gate

Review the diff (`git diff` + untracked files). Report findings, ordered by severity, one line each: `file:line — problem — fix`.

## Checklist

1. **Specs**: every touched spec `S#` of the feature document (`odd/tasks/`) is implemented and tested, with the user's words kept; nothing unrequested was added. For a small change the user's request is the spec.
2. **Architecture**: dependency rule holds; code sits in the right layer; no cross-feature internals.
3. **Correctness**: edge cases, error paths, null/empty input, concurrency, idempotency.
4. **Security**: no secrets, input validated at the boundary, authz checked, no injection.
5. **Tests**: assert behavior (not implementation), deterministic, cover the named cases.
6. **Readability**: names reveal intent, functions small, no dead code or stray debug output.
7. **Docs**: README/help/ADR/tasks updated when behavior or decisions changed.
8. **Risk line**: the change closes with `Risk: none` or `Risk: item N (reason)`. Check it is honest: does the diff touch data, security, a public contract, concurrency, delivery or environment, or code other behavior shares? A high-risk change should be its own commit.
9. **Size**: > ~400 changed lines → suggest splitting into reviewable commits/PRs.

## Output

- `Blockers` (must fix), `Should fix`, `Nit`. Say "none" for empty groups.
- End with a verdict: `ready` or `fix first`, and the exact checks you actually ran.

Read-only: report, do not modify files unless the user asks for fixes.
