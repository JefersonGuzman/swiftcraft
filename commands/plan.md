---
description: Turn an approved spec into plan.md and tasks.md
argument-hint: [spec folder, default latest]
---

Use the `spec-first` skill for the approved spec in: $ARGUMENTS (default: the latest folder in `specs/`).

Delegate the design to the `architect` agent if the change spans several layers. Produce `plan.md` and `tasks.md`, then stop for approval. Do not write code.
