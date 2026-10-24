---
description: Expert audit of existing code (security, performance, architecture or all): read-only experts report what is good and what is wrong in their area
---

Usage: `/swiftcraft:audit <security|performance|architecture|all> [path or feature]`. Without a path, audit the current changes (`git diff` plus untracked files); if there are none, audit the whole project.

1. **Scope and cost first.** Decide the scope, count its files, and tell the user which experts will run. `all` runs three reviews, so say that the cost is about three times a single audit, and wait for a go-ahead before starting it.
2. **Run the experts, read-only.** Use the agents `security-auditor`, `performance-auditor` and `architecture-auditor` (parallel for `all`, each in its own fresh context, none seeing the others' output). They only have Read, Glob and Grep: they never edit, and you must not edit either. Give each the scope and where the project rules are (`docs/constitution.md`, `docs/architecture.md`, `odd/tasks/`, `docs/adr/`). For the architecture expert, first run `node "${CLAUDE_PLUGIN_ROOT}/scripts/arch-graph.js" check` (JavaScript/TypeScript only) and pass its output as evidence to confirm.
3. **Relay the reports** unchanged in structure: Scope, Verdict, What is good, Findings (critical, high, medium, low with `path:line`) and Not verified. For `all`, add one short summary table (area, verdict, count of critical and high findings) and keep each expert's report under its own heading. Never print a secret an expert found; the location is enough.
4. **Do not fix anything.** Ask the user which findings to turn into work (`/swiftcraft:odd`). Save the report to `docs/audits/<date>-<area>.md` only if the user asks for it; the experts themselves never write files.

These reports come from reading code, not from running it: findings about performance are hypotheses to measure, and the "Not verified" section says what was not covered.
