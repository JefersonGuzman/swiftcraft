---
name: tdd-loop
description: Implement one task test-first (RED, GREEN, REFACTOR). Use when building a task from a feature document in odd/tasks/, or any behavior change that has a runnable test setup.
---

# tdd-loop

Implement **one task**, then stop. Part of the `odd` workflow; small changes use it directly with no feature document.

1. **Read** the task and its linked specs (`S#`) in `odd/tasks/<feature-name>.md`, up to `## Log`. For a small change, the user's request is the spec.
2. **RED**: write the smallest test that expresses the behavior through the public interface, one RED test per requested rule. Run it; confirm it fails for the right reason. Show the failure.
3. **GREEN**: write the minimum code to pass. Place it by `architecture-guard`.
4. **REFACTOR**: remove duplication, improve names; tests stay green.
5. **Run** the full test + lint command from `CLAUDE.md`. Report real output, not assumptions.
6. **Update** the feature document: tick the task only after its checks were observed, and record the commit (or the RED/GREEN evidence) on the task line. Update help text and docs if a command, option or message changed.
7. **Close with the Risk line**: `Risk: none` or `Risk: item N (reason)` (items listed in `odd`). Any item means `/swiftcraft:review` before the commit.
8. **Stop.** Suggest a Conventional Commit message (`feat(scope): …`). Commit only if the user asks.

## Test quality

- Assert every observable effect: output, return value, error, persisted state.
- Cover the cases the rule itself names, not extra speculative ones.
- Mock only at ports (I/O boundaries); never mock the unit under test.
- When touching shared code (options, parsers, helpers, validation), add one test proving the previous behavior still holds.
- **Differential check** before finishing: run each existing command or function that shares the code you changed with the new or changed input, against the previous code (a copy of the base commit in a temporary directory, never committed) and against your change; compare output and exit code. Any difference nobody asked for is a regression: fix it and pin it with a test.
- Keep scratch state (temp dirs, caches) outside the worktree and remove it afterwards.

## No runner available?

State it, explain the exception, and use the closest functional check (type-check, build, manual run) instead. Never invent RED/GREEN evidence.
