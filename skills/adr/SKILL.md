---
name: adr
description: Record an architecture decision as a short ADR in docs/adr/. Use when choosing a stack, library, layer boundary, data store, or any tradeoff that will be hard to reverse.
---

# adr

Write one short ADR per durable decision at `docs/adr/NNNN-<slug>.md` (next free number, zero-padded to 4).

## Template

```markdown
# NNNN. <Decision title>

- Status: proposed | accepted | superseded by NNNN
- Date: YYYY-MM-DD

## Context
Forces and constraints in 3-5 lines.

## Decision
What we chose, in one or two sentences.

## Alternatives considered
- <Option> — why not.

## Consequences
Good, bad, and what becomes harder.
```

## Rules

- Present real alternatives with tradeoffs before deciding; the user decides.
- Never edit an accepted ADR to change history: add a new one and mark the old as superseded.
- Keep it under one screen. Link from `docs/architecture.md` when it affects structure.
