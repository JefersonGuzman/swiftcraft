# {{PROJECT_NAME}}

Agent-neutral rules (Claude Code, Codex, Cursor, OpenCode…). Details: `docs/constitution.md`, `docs/architecture.md`.

## Commands

- Test: `{{TEST_CMD}}`
- Lint: `{{LINT_CMD}}`
- Build: `{{BUILD_CMD}}`

## Workflow (ODD)

1. Size first. **Small** (understood, low risk, resumable from the diff): straight to a test, no document. **Large**: a feature document `odd/tasks/<feature-name>.md` (`## Specs`, `## Tasks`, `## Log`) quoting the user's exact words. Never size by file count. Explain, review and proposal requests stay read-only.
2. One task at a time, tests first, then stop and report real output.
3. Close every code change with `Risk: none` or `Risk: item N (reason)`; any item means `/swiftcraft:review` first. Review the diff before committing. Conventional Commits, no AI attribution.
4. Record durable decisions as ADRs in `docs/adr/`. Resume with `/swiftcraft:status`.

## Architecture in one line

Feature-first Hexagonal: `src/<feature>/{domain,application,infrastructure,presentation}`; dependencies point inward only.
