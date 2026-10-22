---
description: Implement one task test-first (RED, GREEN, REFACTOR) then stop
argument-hint: [task id, default the next open task]
---

Use the `tdd-loop` and `architecture-guard` skills to implement: $ARGUMENTS (default: the next open task of the active feature document; run `node "${CLAUDE_PLUGIN_ROOT}/scripts/odd.js" status` to find it, or use the user's request if the change is small and has no document).

Implement only that task. Stop afterwards and report the real test output and the Risk line.
