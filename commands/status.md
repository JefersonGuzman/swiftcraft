---
description: Show where the active feature stands (progress, next task, pending decisions) and how to resume
---

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/odd.js" status` in the project and show the result: the feature, its **state** (`working`, `checking`, `ready` or `needs-decision`) with the reason, the single next action, progress, any "Needs your decision" items and whether the document has problems.

Then say the single next action exactly as reported; never invent a state the script did not report. If it reports problems, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/odd.js" check <file>` and fix the document. If there is no feature document, say that small tasks need none.
