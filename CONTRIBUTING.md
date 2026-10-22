# Contributing

## Principles

- **Stay small.** Every skill, agent and hook costs context in every session. Add only what a real workflow needs; prefer improving an existing skill.
- **Stack-agnostic core.** Language specifics go in `templates/stacks/`.
- **Hooks never hurt.** They must be fast (< 1 s), dependency-free Node, and fail open (exit 0) on bad input.

## Layout

| Path | What |
|------|------|
| `skills/<name>/SKILL.md` | One skill; frontmatter `name` + `description` (say *when* to use it) |
| `agents/*.md` | Subagents; keep them read-only unless needed |
| `commands/*.md` | Slash commands (`/swiftcraft:<name>`) |
| `hooks/` | `hooks.json` + `scripts/*.js` |
| `templates/` | Project scaffold and stack templates |
| `scripts/` | Setup, export and release helpers |
| `tests/` | `node --test` suites for hooks and scripts |

## Workflow

1. Open an issue or describe the change.
2. Add/adjust tests first for hook or script behavior.
3. `npm test` must pass (Node 18+).
4. Add a line under `## [Unreleased]` in `CHANGELOG.md`.
5. Use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`), no AI attribution.

## Releasing

```
npm run release -- minor     # bumps package.json, both plugin manifests, stamps CHANGELOG
git commit -am "chore(release): vX.Y.Z" && git tag vX.Y.Z && git push --tags
```
