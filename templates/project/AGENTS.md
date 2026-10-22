# {{PROJECT_NAME}}

Agent-neutral rules (Claude Code, Codex, Cursor, OpenCode…). Details: `docs/constitution.md`, `docs/architecture.md`.

## Commands

- Test: `{{TEST_CMD}}`
- Lint: `{{LINT_CMD}}`
- Build: `{{BUILD_CMD}}`

## Workflow

1. Spec first: `specs/NNN-<slug>/spec.md` → `plan.md` → `tasks.md`.
2. One task at a time, tests first, then stop and report real output.
3. Review the diff before committing. Conventional Commits, no AI attribution.
4. Record durable decisions as ADRs in `docs/adr/`.

## Architecture in one line

Feature-first Hexagonal: `src/<feature>/{domain,application,infrastructure,presentation}`; dependencies point inward only.
