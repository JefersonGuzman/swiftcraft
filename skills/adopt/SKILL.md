---
name: adopt
description: Bring the harness to a project that already has code: read-only analysis (observed vs inferred), then drafts in docs/proposed. Use when starting swiftcraft on an existing repository.
---

# adopt

For a project that **already exists**. `project-start` is for new ones. Adopting must not disturb what is there: the first pass is **read-only**, the output is a **proposal**, and the user decides.

## Process

1. **Scan, read-only.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/adopt.js" scan` in the project (`--json` for the raw data). It reads files and git history, never the contents of `.env` files, and changes nothing.
2. **Show three things apart**, in this order, and never blend them:
   - **Observed**: facts read from files (languages, manifests, the commands the project itself states, CI commands, folders, tooling, git history).
   - **Inferred**: conclusions with their evidence and confidence (stack, framework, architecture style, commit convention). Say they must be verified.
   - **Uncertain** and **Conflicts**: what only a person can settle (no test command found, monorepo, existing `CLAUDE.md`/`AGENTS.md`, two linters…).
3. **Ask one question at a time**, only about the most blocking uncertainty (for example "how are the tests run?"), then stop and wait. Do not assume the answer.
4. **Propose.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/adopt.js" propose`. It writes `docs/proposed/AGENTS.md`, `constitution.md`, `architecture.md` and a `README.md`, **new files only**: an existing file is skipped. Then refine the drafts with what the user confirmed, replacing an `UNKNOWN` only with information that was confirmed or observed.
5. **Present the drafts for review** and say how to adopt them: copy `constitution.md` and `architecture.md` into `docs/`, merge `AGENTS.md` by hand into the existing one. Do the copy only if the user says so, and never overwrite an existing file without their explicit yes.
6. **Next step**: `/swiftcraft:odd <first change>`. Old code is not rewritten; structure improves where code is already being changed.

## Rules

- **Read-only first.** No application code, tests, configuration or existing documents are modified by the analysis or by the proposal.
- Never invent a test, lint or build command. If the project does not state it, the draft says `UNKNOWN` and you ask.
- Never read or print secrets; `.env` files are only listed.
- Mark every inferred statement as inferred and keep its evidence.
- If a file such as `CLAUDE.md` or `AGENTS.md` already exists, the proposal goes to `docs/proposed/` and the merge is the user's; you never overwrite it.
- Ask one question at a time and wait.
