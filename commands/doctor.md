---
description: Read-only diagnosis of the swiftcraft install and the current project (OK / WARNING / ERROR with fixes)
---

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.js"` in the project and show the result.

It is read-only: it does not change or delete anything. Required parts (Node.js, manifest, hooks, scripts) are ERRORs; optional tools (GitHub CLI, Claude CLI, Engram, RTK) only warn. For every WARNING or ERROR, give the user the `Fix:` line as reported; do not run fixes yourself unless asked. Never describe a check as passed if the output did not say OK.
