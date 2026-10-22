---
description: Show where the active feature stands (progress, next task, pending decisions) and how to resume
---

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/odd.js" status` in the project and show the result: the feature, progress, the next task, any "Needs your decision" items and whether the document has problems.

Then say the single next step (for example `/swiftcraft:build` for the next task, or the open decision the user must make). If it reports problems, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/odd.js" check <file>` and fix the document. If there is no feature document, say that small tasks need none.
