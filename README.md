# swiftcraft — structured vibe-coding harness

A small Claude Code plugin that keeps vibe coding fast **and** organized: spec first, architecture guardrails, test-first loop, written decisions, fresh-context review.

Stack-agnostic. Lean on purpose: 11 skills, 4 agents, 10 commands, 5 hooks.

## Install

```
/plugin marketplace add JefersonGuzman/swiftcraft
/plugin install swiftcraft@swiftcraft
```

Local test before publishing: `claude --plugin-dir ./swiftcraft`.

Requires Node.js 18+ (hooks are plain Node scripts, work on Windows/macOS/Linux).

## Workflow

| Step | Command | Result |
|------|---------|--------|
| 0 | `/swiftcraft:init` | Project scaffold: constitution, architecture, ADRs, spec templates |
| 1 | `/swiftcraft:spec <idea>` | `specs/NNN-slug/spec.md` (what/why) |
| 2 | `/swiftcraft:plan` | `plan.md` + `tasks.md` |
| 3 | `/swiftcraft:build` | One task, RED → GREEN → REFACTOR, then stop |
| 4 | `/swiftcraft:review` | Fresh-context diff review, verdict |
| — | `/swiftcraft:adr <topic>` | Decision record in `docs/adr/` |
| — | `/swiftcraft:remember <text>` | Save to project memory |
| — | `/swiftcraft:setup` | Check/install companions (Engram, RTK) |
| — | `/swiftcraft:export` | Generate Cursor / Gemini CLI / Copilot rules from AGENTS.md |
| — | `/swiftcraft:pr-review <n\|url>` | Review a GitHub PR against your constitution/specs/architecture; posts comments only after you confirm |

## What's inside

- **Skills**: `project-start`, `architecture-guard`, `spec-first`, `tdd-loop`, `adr`, `review-gate`, `context-hygiene`, `memory`, `token-saver`, `ui-design`, `pr-review`.
- **Agents**: `architect` (design), `reviewer` (diff review), `explorer` (compact code maps), `pr-reviewer` (PR findings as JSON). All read-only; `pr-reviewer` has no shell at all.
- **Hooks**
  - `SessionStart`: injects `docs/constitution.md`; after compaction restores the active spec's open tasks.
  - `PreToolUse`: blocks writes to `.env`, keys and certificates.
  - `PostToolUse` `arch-lint`: flags framework/outer-layer imports inside `domain/` and `application/` (override with `docs/arch-rules.json`).
  - `Stop` memory nudge: after 3+ file edits with nothing saved, asks once for `mem_save` + `mem_session_summary` (loop-safe; opt out with `SWIFTCRAFT_NO_NUDGE=1`, tune with `SWIFTCRAFT_NUDGE_EDITS`).
- **Stack templates** (`templates/stacks/`): Next.js, Node API, Python + FastAPI. `/swiftcraft:init` picks one.
- **Template** (`templates/project/`): `AGENTS.md`, `CLAUDE.md`, `docs/`, `specs/_template/`, `.env.example`, `.gitignore`.

## Memory (Engram)

The `memory` skill and `/swiftcraft:remember` use [Engram](https://github.com/Gentleman-Programming/engram) MCP tools when present (`mem_current_project`, `mem_save`, `mem_search`, `mem_context`, `mem_session_summary`) and fall back to `docs/memory/*.md` otherwise. The `SessionStart` hook reminds the agent of the protocol. Run `/swiftcraft:setup` to check the Engram binary and install its plugin (`node scripts/setup-engram.js --apply`); the binary itself is installed from Engram's docs.

## Other agents

- **Codex / OpenCode / Cursor / Gemini / Copilot** read `AGENTS.md` (open standard). `/swiftcraft:export` generates `.cursor/rules/swiftcraft.mdc`, `GEMINI.md` and `.github/copilot-instructions.md` from it.
- `.codex-plugin/plugin.json` exposes the same `skills/` to Codex. Skills are plain `SKILL.md` folders and can be copied to any agent that reads them.
- Hooks, slash commands and agents are Claude Code features. The Codex manifest and the Cursor/Gemini/Copilot exports were written from public docs and are **not yet tested** in those tools.

## PR review

`/swiftcraft:pr-review 42` (or a PR URL) fetches the PR with the GitHub CLI (`gh auth status` must be OK), has the read-only `pr-reviewer` agent check it against `docs/constitution.md`, `docs/architecture.md`, the specs and ADRs, then shows a **dry run** of the review. Only after you confirm does it publish, as a single `COMMENT` review: findings on diff lines become inline comments, the rest go into the review body, secrets are redacted, and approving or requesting changes stays with you. PR text is treated as untrusted data. Scripts: `scripts/pr-fetch.js`, `scripts/pr-post.js` (dry run unless `--post`).

For fully automatic reviews on every PR you would add a CI workflow with Claude Code's GitHub Action; that needs an API key secret and is not included.

## Architecture it enforces

Feature-first Hexagonal: `src/<feature>/{domain,application,infrastructure,presentation}`, composition root in `src/app/`. Dependencies point inward only.

## Customize

- Edit `templates/project/` to change what new projects get.
- Add forbidden-import regexes in a project's `docs/arch-rules.json`:
  ```json
  { "domainForbidden": ["from\\s+['\"]my-orm"] }
  ```
- Trim or add skills under `skills/<name>/SKILL.md`.

## Design notes

Ideas borrowed in spirit from spec-driven development, ADRs, TDD, and fresh-context review harnesses, but kept small: a harness that loads hundreds of skills costs context on every session.

## Development

`npm test` (Node 18+). See [CONTRIBUTING.md](CONTRIBUTING.md) and [CHANGELOG.md](CHANGELOG.md).

## License

MIT

## Token savings

The `token-saver` skill ranks levers by impact: compress tool output (RTK) > read less > keep context small > shorter replies. `/swiftcraft:setup` detects RTK; `node scripts/setup-engram.js --apply --with-rtk` installs it on Windows (`winget install rtk-ai.rtk` + `rtk init -g`). RTK's hook only covers Bash calls, not the built-in Read/Grep/Glob.
