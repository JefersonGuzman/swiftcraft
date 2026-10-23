---
description: Validate with the project's own commands, draft the PR description, and open the pull request only after you confirm
---

Load the `delivery` skill. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/delivery.js" validate --out <temp file>` and report each PASS/FAIL as it is. Then run `node "${CLAUDE_PLUGIN_ROOT}/scripts/delivery.js" pr-body --base <base> --validated <temp file>` and show the description and a Conventional Commit title.

Ask the user to confirm the exact action (push this branch, open this PR with this title and base). Do nothing remote before a clear yes, never force-push, and do not merge unless the user asks for it separately. If validation failed or found no commands, say so and let the user decide; the description must state **Not verified** rather than claim the tests passed.
