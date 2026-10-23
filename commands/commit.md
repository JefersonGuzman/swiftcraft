---
description: Plan reviewable commits for the current changes and commit them one unit at a time, after you confirm
---

Load the `delivery` skill. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/delivery.js" plan` and show the result: branch, suggested commit units, risks, and any possible secret.

If you are on `main` or `master`, propose a branch name and wait for the user to confirm before creating it. Then, for each unit and only after the user confirms the plan: stage exactly that unit's files, check the message with `node "${CLAUDE_PLUGIN_ROOT}/scripts/delivery.js" check-message "<message>"` (Conventional Commits, no Co-Authored-By or AI attribution, `Risk:` line for code), and commit. Sensitive units get their own commit after `/swiftcraft:review`. Never push here; that is `/swiftcraft:pr`.
