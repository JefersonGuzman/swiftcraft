---
name: spec-first
description: Size a change first, then turn anything that is not small into spec, plan and tasks before coding. Use for any new feature or behavior change; small, understood, low-risk changes skip the paperwork.
---

# spec-first

Vibe coding stays fast when ceremony is proportional: **small work goes straight to a test, large work is written down first.**

## Step 0: classify the size

A task is **Small** when all three hold:

1. **Understood**: the outcome is specified, you know what and where to change, and no product or design decision is open.
2. **Contained risk**: it touches none of the high-risk items below.
3. **Resumable from the diff**: if the session stopped now, someone could finish it from the user's request and `git diff` alone.

Otherwise it is **Large**: several sessions of work, an open decision, waiting on something external, separate deliverables, or requirements too long to survive a context compaction.

Never decide size by the number of files, commands, tests or fixes: one understood change can span many files and still be small.

### High-risk items (a mistake would be hard to detect, hard to undo, or reach beyond the change)

1. **Data or irreversible effects**: migrations, changing or deleting stored data, persisted format changes.
2. **Security**: auth, permissions, credentials, secrets, guards.
3. **Contracts others consume**: changing or removing public API, CLI flags, config formats, published exports (adding an optional field or flag is not high risk).
4. **Concurrency**: locks, races, async ordering.
5. **Delivery or environment**: installers, release, CI, deploy, dependencies.
6. **No test would catch a regression** in what changes.

If a bounded look cannot tell whether an item applies, treat the task as high risk.

## Small path

- **No spec files.** State in one line what you will change and why, then use `tdd-loop` (test first, minimal code, run the suite once).
- Ask at most one question, and only for a real open decision.
- Close with the **Risk line** (below).

## Large path: `specs/NNN-<slug>/`

### 1. spec.md: WHAT and WHY (no tech)

- Problem and user outcome (2-4 lines)
- Requirements `R1..Rn`, each testable ("The system must…"). **Quote the user's exact strings, error messages and examples verbatim**; never reword them and never add requirements they did not ask for (mark assumptions as assumptions).
- Acceptance examples (Given/When/Then)
- Out of scope
- Open questions (ask one at a time; never assume)
- `## Log` at the end: `L1` is the user's original request, verbatim. Append later corrections, evidence and decisions with the date. A requirement change appends its Log entry first, then rewrites only the affected `R#` and reopens only its task.

### 2. plan.md: HOW

- Affected features/layers, new ports and adapters, data model changes
- Key decisions (link ADRs)
- Test strategy: which requirement is covered by which test level
- Risks and rollback

### 3. tasks.md: ordered, small

- `- [ ] T1 (R1,R2) <outcome> — done when: <observable check>`
- Each task is about one reviewable commit; tests live with the behavior they prove.
- Tick a box only after its outcome and checks were observed.

No code before the spec is approved.

## Risk line (every code change, small or large)

Close each change with `Risk: none` or `Risk: item N (reason)` using the list above. Before writing `Risk: none`, check whether the diff changes code that existing behavior the request did not mention also uses (shared helpers, parsers, options): if so, that is item 3.

**Any item named means `/swiftcraft:review` runs before the commit**, and a high-risk change gets its own commit so the review can take it alone.

## Rules

- Use the templates in `specs/_template/` when the project has them.
- Skip the Large path for typos, config tweaks and one-line fixes: they are Small by definition.
- When a task grows mid-way and stops passing the three Small conditions, stop and switch to the Large path.
