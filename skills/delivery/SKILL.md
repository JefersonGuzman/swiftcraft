---
name: delivery
description: Turn finished work into reviewable commits and a traceable pull request (commit plan, branch and message rules, validation, PR description). Use when work is ready to commit, push or open a PR.
---

# delivery

Finished work should reach the repository as small commits a person can review, and a pull request that says what changed, why, how it was checked and what is risky. The helper `node "${CLAUDE_PLUGIN_ROOT}/scripts/delivery.js"` **only reads** the repository; every commit, push, PR creation and merge is yours to run **after the user confirms**.

## Process

1. **Plan.** Run `delivery.js plan`. It shows the branch (and asks for a new one when you are on `main`/`master`), the active feature document and its tasks, the suggested commit units (a test travels with the code it covers), the risk tier of each, generated files, sensitive files and any possible secret (never printed).
2. **Branch.** Never commit on the default branch. Branch names look like `feat|fix|docs|chore/short-name`. Create the branch only after the user agrees to the name.
3. **Commit one unit at a time.** Stage exactly that unit's files, write the message, run `delivery.js check-message "<message>"`, then commit. Messages are **Conventional Commits** (`type(scope): summary`, 72 characters or fewer, no trailing period). The body says why, and ends with the `Risk:` line when the change touches code. **Never add `Co-Authored-By` or any AI attribution.**
4. **Size is advisory.** About 400 authored lines is a guide, not a cap. Split where it keeps each commit easy to review; never split a test from the code it covers, and never pad a commit to hit a number.
5. **Sensitive areas get their own commit** (data and migrations, auth and secrets, public contracts, CI/deploy/dependencies) and `/swiftcraft:review` runs before that commit. A possible secret blocks the commit until it is removed.
6. **Validate.** Run `delivery.js validate --out <file>`. It runs only the test, lint, typecheck and build commands the project itself states, and reports each result as it is. If one fails, say so and fix or ask; if none exist, say nothing was validated.
7. **Describe.** Run `delivery.js pr-body --base main --validated <file>` for the description: commits, task-to-commit traceability, the real test results, risk lines and the repository's own checklist. Show it to the user.
8. **Confirm, then publish.** Ask once, naming the exact action: push this branch, open this PR (title and base), or merge. Do nothing remote without a clear yes, and an approval for one action does not cover the next.

## Rules

- Read first, act on confirmation. Push, PR creation and merge each need the user's explicit yes.
- Never force-push, never rewrite history that others may have, never skip hooks.
- Never claim tests passed unless `validate` shows it; otherwise the PR body says **Not verified**.
- Never include secrets in commits, messages or the PR body.
- The PR title is a Conventional Commit subject; the body comes from `pr-body`, edited only to be more accurate.
