# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

## [0.6.0] - 2026-10-23

### Added
- **Optional output styles** (`output-styles/swiftcraft-lean.md`, `swiftcraft-explained.md`): short result-first answers, or a short *why* after each change. They keep the coding instructions, are never forced on the user and change tone and length only (tests, permissions, hooks, the ODD protocol, the `Risk:` line and "not verified" reporting stay). Plugin-shipped output styles are documented by Claude Code; loading these two in a live session has not been checked.
- **Documentation sources** (`context-hygiene`): use a documentation MCP only if one is available, and separate "Consulted: <source>" from "general knowledge (not verified against current docs)".
- **Other agents status** (`docs/other-agents.md`): what the export generates for Cursor, Gemini CLI and Copilot, and that following the rules is **not verified**; the Gemini CLI pilot could not run because the CLI was not authenticated.
- **Beta channel and verifiable releases**: `updates.channel` (`stable` by default, `beta`) or `SWIFTCRAFT_CHANNEL=beta` makes the update notice and `/swiftcraft:update` also see GitHub prereleases (drafts never); the stable channel ignores them, and the notice cache is per channel. Versions may now be prereleases (`0.6.0-beta.1`, ordered per SemVer) and `npm run release -- beta` bumps them (from a prerelease, `major|minor|patch` publish its stable version). The release workflow marks prereleases with `--prerelease` and attaches a source archive, `SHA256SUMS` and a build provenance attestation (`SECURITY.md` explains how to verify). The pipeline additions have not run on a real release yet and `claude plugin tag` with a prerelease version is untested, so both are unverified.
- **Dependency graph check, proof of concept** (`scripts/arch-graph.js check`, `docs/dependency-graph.md`): whole-project import graph for JavaScript/TypeScript that reports what the per-edit `arch-lint` hook cannot see: transitive layer violations (with the chain that proves it), imports of another feature's internals instead of its `index`/`public`/`api` entry, and dependency cycles. Measured on a planted fixture (the hook flags the direct import only; the graph also flags the transitive import, the cross-feature import and the cycle, with no false positive on the clean file); not yet run on a large real codebase. Optional and read-only, not wired into hooks or CI. CodeGraph was not evaluated. The shared rules moved to `scripts/lib/arch.js`; `arch-lint` behaves as before.
- **Optional adversarial review** (`/swiftcraft:judge`, `scripts/judge.js`): two independent reviewers return findings as JSON and a script merges them without a model into **coincident** (same place within 3 lines or the same quote, same severity), **discrepant** (same place, different severity) and **unconfirmed** (only one saw it) findings plus a verdict. An unconfirmed blocker or any discrepancy is `needs human decision`; nothing is silently dropped. Secrets in findings are redacted. Costs about double a normal review, so the cost is shown first.
- **Risk-tiered review** (`scripts/review-plan.js`, `scripts/lib/review-plan.js`): `/swiftcraft:review` now plans the review from the change's paths: low risk gets one reviewer on readability, medium one reviewer on reliability, resilience and readability, high risk (data, security, contracts, delivery, environment) two independent read-only reviewers that together cover the four lenses `risk`, `resilience`, `readability` and `reliability`, never more. The plan prints a rough cost estimate (labelled as an estimate) that must be shown to the user before any reviewer starts, and allows at most one correction round. The `reviewer` agent understands a `Lenses:` line. The tier is a path-based heuristic, not a measurement of true risk.
- **Model per agent role, deliberately not enabled** (`docs/model-per-role.md`): records that the `model:` frontmatter field exists (`sonnet`, `opus`, `haiku`, `fable`, a full ID or `inherit`), that its behavior for plugin-shipped agents is not verified, a labelled hypothesis per role, and how to validate quality, latency and cost with `claude plugin eval` before pinning. `tests/models.test.js` fails if an agent pins a model while the document says `Status: not enabled`.
- **Per-project configuration** (`swiftcraft.config.json`, `scripts/lib/config.js`, `node scripts/config.js show`): validated settings `memory.nudge`, `memory.nudgeEdits`, `review.reminder`, `updates.check` and `delivery.advisoryLines`, with precedence defaults < project file < environment. Unknown keys (with a "did you mean"), wrong types, out-of-range numbers and anything that looks like a secret are rejected with an actionable message and the whole file is ignored until fixed; mandatory controls (command guard deny rules, protected files) cannot be configured. `doctor` validates it. The hooks and `delivery` read it.
- **Review reminder for sensitive changes** (`hooks/scripts/review-track.js`, `review-reminder.js`): when the working tree changes high-risk areas (data and migrations, security, contracts, CI/deploy/dependencies, by path) and no `/swiftcraft:review` or swiftcraft reviewer ran on exactly that diff in the session, the Stop hook asks for a review once per diff (a new edit to the diff reminds again). Review evidence is the review skills or the `reviewer`/`pr-reviewer` agents, tracked per session by a hash of the sensitive diff; calls made by subagents do not count. Opt out with `SWIFTCRAFT_NO_REVIEW_REMINDER=1`. Covered by tests with simulated hook input; not yet observed in a live Claude Code session.
- **Reviewable delivery** (`skills/delivery`, `scripts/delivery.js`, `/swiftcraft:commit`, `/swiftcraft:pr`): `plan` groups the working tree into commit units (a test travels with the code it covers, sensitive areas get their own commit, lockfiles and generated files are not counted, about 400 authored lines is advisory and never a cap), checks the branch name and refuses the idea of committing on `main`, links the active feature document, and reports a possible secret without printing it. `check-message` enforces Conventional Commits and rejects `Co-Authored-By` or AI attribution. `validate` runs only the test, lint, typecheck and build commands the project itself states and reports failures as they are (or says nothing was validated). `pr-body` drafts the description with commits, task-to-commit traceability, real test results (or "Not verified"), risk lines and the repository's own checklist. The scripts only read the repository (a test enforces it); push, PR creation and merge need your confirmation. Shared path risk classification lives in `scripts/lib/risk.js`.
- `/swiftcraft:adopt` (`skills/adopt`, `scripts/adopt.js`): adopt the harness in a project that already has code. `scan` is read-only and separates **observed** facts (languages, manifests, the commands the project itself states, CI commands, tooling, folders, git history) from **inferred** conclusions (each with evidence and a confidence) and from **uncertainties** and **conflicts**; it never reads `.env` contents and never invents a test command. `propose` writes drafts (`AGENTS.md`, `constitution.md`, `architecture.md`) only under `docs/proposed/`, new files only, with `UNKNOWN` wherever the project does not say.
- **Evals** (`evals/`, run with `claude plugin eval`): 9 behavioural cases for the skills and hooks (read-only requests stay read-only, small vs large sizing, feature document in the user's words, honest test reporting, secret file protection, destructive commands blocked, no remote publishing without confirmation, status derived from the document). They carry their data in the prompt (no scaffold scripts, so they run on any OS and execute nothing as the user), are tagged `noshell` or `shell`, and are linted by `tests/evals.test.js`; they are not part of `npm test`. `evals/RESULTS.md` logs the real runs.
- **Command guard** (`PreToolUse` on Bash and PowerShell, `hooks/scripts/command-guard.js`, `scripts/lib/guard.js`): catastrophic commands are blocked (`deny`: deleting the root, home, a drive or system folders, disk wipes, fork bomb, force-push or deletion of `main`/`master`, writing secret files through the shell) and risky ones ask for confirmation (`ask`: recursive deletes outside the project or with unverifiable targets, `git reset --hard`, `git clean -f`, other force pushes, reading secrets, `curl | sh`, destructive SQL, `chmod -R 777`, irreversible publishes). Understands quoting, chaining, substitutions, `bash -c`, `eval`, wrappers and redirections; unparsable high-risk input asks. Optional `docs/guard-rules.json` can add rules and relax `ask` rules, never `deny` rules. Minimal local log without command text. `doctor` smoke-tests it and validates the rules file. Static analysis: it has false negatives and positives and does not replace the platform's permissions (see `SECURITY.md`).
- `scripts/cleanup.js`: safe removal of the scratch files swiftcraft leaves in the OS temp folder (`swiftcraft-pr-<n>-<random>` folders from `pr-fetch`, and session state files older than 7 days). Dry run by default, `--apply` to delete, `--older-than <hours>` (default 24), `--dir <folder>` for one specific folder. Keeps recent and unrecognized entries, never follows symlinks or junctions, refuses paths outside the temp folder, and reports every error (exit code 1). `pr-post --post`, the `pr-review` skill and `doctor` point to it.
- `/swiftcraft:doctor` (`scripts/doctor.js`, `--json`, `--project`, `--root`): read-only diagnosis with `OK` / `WARNING` / `ERROR` and a fix for each. Required parts (Node.js 18+, plugin manifest, hooks configuration, scripts, hook smoke tests) are errors; optional tools (GitHub CLI, Claude CLI, Engram, RTK) only warn; project checks cover initialization, feature documents, old pull-request scratch folders and stale state files. Exit code 1 only when there is an error; it never changes or deletes anything.
- Deterministic next step: `node scripts/odd.js status [--json]` and `/swiftcraft:status` now report one of four states (`working`, `checking`, `ready`, `needs-decision`) with the reason and the single next action, derived only from the feature document. A malformed, empty or undecided document is `needs-decision`; the state is never guessed. A `Closed:` Log entry marks a verified feature. Session start shows the same state and action.

### Fixed
- The `odd` skill pointed to `odd/tasks/_template.md`, which does not exist in a fresh project, and `odd-lint` only said what was wrong: models invented their own document format (found by the evals, 2 of 5 runs correct before the fix, 6 of 7 after). The exact format is now inline in the skill, in `/swiftcraft:odd`, in every `odd-lint` and `odd.js check` message, and a malformed task line is reported with the correct form.
- Plugin, Codex and marketplace descriptions still said "spec-first"; they now describe the ODD workflow (a test keeps them in sync).

## [0.5.0] - 2026-10-22

### Breaking
- The spec-driven flow is replaced by **ODD (Organic Driven Development)**. `/swiftcraft:spec`, `/swiftcraft:plan` and the `spec-first` skill are removed; per-feature `specs/NNN-<slug>/{spec,plan,tasks}.md` is replaced by one feature document `odd/tasks/<feature-name>.md` (`## Specs` with `S#`, `## Tasks` with `T#`, `## Log` with `L1`). Existing `specs/` folders are not read any more: move what you still need into a feature document, or delete them.

### Added
- `odd` skill and `/swiftcraft:odd <request>`: the seven-step protocol (authorize, explore, resolve uncertainty, classify, track, implement, close). Explain, review and proposal requests stay read-only until a change is explicitly requested; delegation only for named reasons (mapping, parallel units, context, verification); slices of about 400 lines as an advisory size; one "Needs your decision" result when blocked.
- `/swiftcraft:status` and `scripts/odd.js` (`status`, `check`): progress, next task, pending decisions and structural validation of a feature document.
- `odd-lint` hook: validates `odd/tasks/<feature>.md` on every write (every task links a spec, every spec is covered, unique IDs, `L1` present, route declared, ticked tasks record a commit or evidence).
- Session start and post-compaction context now show the active feature document and its open tasks.
- Memory mirror of feature documents under the topic `odd/<feature-name>/tasks`.
- `tdd-loop`: one RED test per requested rule and a differential check against the base commit when shared code changes.
- `templates/project/odd/tasks/_template.md`; project templates, `review-gate`, `pr-reviewer` and `architect` follow the new flow.

### Fixed
- `npm run release` now prints next steps that match the branch and pull request workflow instead of suggesting a push to `main`.

## [0.4.0] - 2026-10-22

### Changed
- `spec-first` now classifies the size of a change first (small / large, never by file count) and lists six high-risk items. Small, understood, low-risk work goes straight to a test with no spec files; large work gets spec/plan/tasks with the user's exact words and a `## Log` (`L1` = original request). Every code change closes with a `Risk: none | item N` line and any named risk means `/swiftcraft:review` before the commit. `tdd-loop`, `review-gate`, `/swiftcraft:spec` and the project templates (`AGENTS.md`, constitution, spec template) follow the same rule.

### Fixed
- Memory hooks never removed their per-session state files; files older than 7 days are now deleted when a new session starts, and the state folder can be set with `SWIFTCRAFT_STATE_DIR`. Tests use self-cleaning temp folders (`tests/helpers.js`).

## [0.3.1] - 2026-10-22

### Fixed
- `update-check` reads the latest GitHub release (falls back to the raw `plugin.json`): the raw CDN is cached for minutes after a release and reported the old version. Release notes are used when the CHANGELOG cannot be loaded.
- `pr-review`: findings now carry a `quote` of their source line, verified against the diff; a wrong line number (the reviewer used `diff.patch` lines instead of file lines in a real test) is relocated or moved to the review body instead of commenting on the wrong line.

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
