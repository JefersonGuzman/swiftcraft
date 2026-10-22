---
name: spec-first
description: Turn an idea into spec, plan and tasks before coding. Use for any new feature or behavior change that is more than a trivial fix.
---

# spec-first

Vibe coding stays fast when intent is written down first. Three small artifacts per feature in `specs/NNN-<slug>/`:

## 1. spec.md — WHAT and WHY (no tech)

- Problem and user outcome (2-4 lines)
- Requirements `R1..Rn`, each testable ("The system must…")
- Acceptance examples (Given/When/Then, with exact strings the user gave)
- Out of scope
- Open questions (ask the user, one at a time; never assume)

## 2. plan.md — HOW

- Affected features/layers, new ports and adapters
- Data model changes
- Key decisions (link ADRs)
- Test strategy: which requirement is covered by which test level
- Risks and rollback

## 3. tasks.md — ordered, small

- `- [ ] T1 (R1,R2) <outcome> — done when: <observable check>`
- Each task ≤ ~1 reviewable commit; tests live with the behavior they prove.

## Rules

- Use the template in `specs/_template/` when the project has it.
- Quote the user's exact words for requirements; never reword examples.
- A requirement change edits spec first, then plan/tasks. No code before the spec is approved.
- Skip this skill for typos, config tweaks and one-line fixes.
