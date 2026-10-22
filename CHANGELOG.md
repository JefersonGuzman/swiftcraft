# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

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
