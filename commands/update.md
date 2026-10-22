---
description: Check whether a newer swiftcraft is available and show how to update
---

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/update-check.js" --verbose` and show the result: installed version, latest version, what changed (CHANGELOG) and the update commands.

Do not run `claude plugin update` yourself. Give the user the two commands and remind them that Claude Code must be restarted afterwards. If the check cannot reach GitHub, say so plainly.
