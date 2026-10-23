---
description: Adopt the harness in a project that already has code (read-only analysis, then draft documents in docs/proposed)
argument-hint: [project directory, default the current one]
---

Use the `adopt` skill for the project: $ARGUMENTS (default: the current directory).

Start with `node "${CLAUDE_PLUGIN_ROOT}/scripts/adopt.js" scan` (read-only) and show its **Observed**, **Inferred** and **Uncertain** sections separately. Change no application code. Ask at most one question at a time about the most blocking uncertainty, then stop for the answer. Only after that, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/adopt.js" propose` to create drafts in `docs/proposed/`, and let the user review them; never overwrite an existing file.
