---
name: tdd-loop
description: Implement one task test-first (RED, GREEN, REFACTOR). Use when building a task from tasks.md or any behavior change that has a runnable test setup.
---

# tdd-loop

Implement **one task**, then stop.

1. **Read** the task, its requirements (`R#`) and acceptance examples.
2. **RED**: write the smallest test that expresses the behavior through the public interface. Run it; confirm it fails for the right reason. Show the failure.
3. **GREEN**: write the minimum code to pass. Place it by `architecture-guard`.
4. **REFACTOR**: remove duplication, improve names; tests stay green.
5. **Run** the full test + lint command from `CLAUDE.md`. Report real output, not assumptions.
6. **Update** `tasks.md` (check the box only after observed pass) and docs/help text if a command, option or message changed.
7. **Close with the Risk line**: `Risk: none` or `Risk: item N (reason)` (items listed in `spec-first`). Any item means `/swiftcraft:review` before the commit.
8. **Stop.** Suggest a Conventional Commit message (`feat(scope): …`). Commit only if the user asks.

## Test quality

- Assert every observable effect: output, return value, error, persisted state.
- Cover the cases the requirement names, not extra speculative ones.
- Mock only at ports (I/O boundaries); never mock the unit under test.
- When touching shared code, add one test proving the previous behavior still holds.

## No runner available?

State it, explain the exception, and use the closest functional check (type-check, build, manual run) instead. Never invent RED/GREEN evidence.
