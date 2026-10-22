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
6. Work on a branch and open a pull request (see below); never push to `main`.

## Branches and pull requests

`main` is always releasable. **Nobody commits to it directly, maintainers included**: every change lands through a pull request with green CI.

| Branch | Use |
|--------|-----|
| `feat/<short-name>` | new command, skill, hook or behavior |
| `fix/<short-name>` | bug fix (hotfixes too) |
| `docs/<short-name>` | documentation only |
| `chore/<short-name>` | tooling, CI, housekeeping |
| `release/x.y.z` | version bump + changelog stamp |

Rules: branch from an up-to-date `main`, keep branches short-lived (days, not weeks), one topic per branch.

```
git switch main && git pull
git switch -c feat/my-change
# ... tests first, commits in Conventional Commits ...
git push -u origin feat/my-change
gh pr create --base main            # fill in the PR template
gh pr checks --watch                # CI: 3 operating systems x Node 18 and 22
gh pr merge --squash --delete-branch
```

The PR title is also a Conventional Commit: with squash merge it becomes the one commit that lands on `main`. Contributors without write access work from a fork and open the PR from there.

## Releasing

Releases also go through a branch and a PR:

```
git switch main && git pull
git switch -c release/X.Y.Z
npm run release -- minor     # bumps package.json, both plugin manifests, stamps CHANGELOG
claude plugin validate .     # manifest check
git commit -am "chore(release): vX.Y.Z"
# push, open the PR, wait for green CI, squash-merge it, then:
git switch main && git pull
claude plugin tag --push     # creates and pushes the tag swiftcraft--vX.Y.Z (validates manifests agree)
```

Pushing the tag triggers `.github/workflows/release.yml`: it runs the tests, checks the tag matches `plugin.json`, and publishes a GitHub release with the CHANGELOG section as notes. Users see the new version with `/swiftcraft:update`.

Version rules (SemVer): **patch** for fixes, **minor** for new commands/skills/hooks, **major** for anything that breaks existing users (renamed commands, changed hook behavior or file formats). Put breaking changes under a `### Breaking` heading in the CHANGELOG. Installed users only see an update when the `version` field changes, so every release must bump it.
