# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-10-22

### Added
- Plugin icon, `SECURITY.md`, issue and PR templates, README screenshot and requirements.
- `/swiftcraft:setup` checks the Node.js version (18+) first.
- `/swiftcraft:pr-review`: PR review against the project constitution/specs/architecture with a dry run and confirmed posting (`pr-review` skill, read-only `pr-reviewer` agent, `scripts/pr-fetch.js`, `scripts/pr-post.js`).
- `/swiftcraft:update` and a once-a-day `SessionStart` update notice (`scripts/update-check.js`, opt out with `SWIFTCRAFT_NO_UPDATE_CHECK=1`).
- Release automation: `.github/workflows/release.yml` publishes a GitHub release from the CHANGELOG when a `swiftcraft--vX.Y.Z` tag is pushed; `scripts/changelog-notes.js`.
- `repository`/`homepage` in the manifests and a marketplace description.

### Fixed
- `pr-fetch.js` ignored its first positional argument when `--repo` was absent, so `/swiftcraft:pr-review 42` failed at step 1; arguments are now parsed in `scripts/lib/pr-args.js` with tests.
- Memory nudge: writing fallback memory files counts as a save, and edits made by subagents (`agent_id`) no longer count toward the parent session.

## [0.2.0] - 2026-10-22

### Added
- Stack templates: Next.js, Node.js API, Python + FastAPI (`templates/stacks/`).
- Memory autosave nudge: `Stop` hook asks for `mem_save`/`mem_session_summary` after real work; `SessionStart` `compact` restores open tasks.
- `ui-design` skill (atomic design, container/presentational, tokens, five UI states, a11y).
- `token-saver` skill and optional RTK install in `/swiftcraft:setup`.
- Cross-agent support: `.codex-plugin/plugin.json` and `/swiftcraft:export` (Cursor, Gemini CLI, Copilot rules from `AGENTS.md`).
- Tests (`node --test`), CI workflow, release script, CONTRIBUTING.

## [0.1.0]

### Added
- Initial harness: 7 skills, 3 agents, spec-first commands, hooks (`protect-files`, `arch-lint`, `session-start`), project scaffold, Engram memory skill.
