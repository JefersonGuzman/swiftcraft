---
name: odd
description: Organic Driven Development, the default workflow for any request. Authorize, explore, size the work, track large work in a feature document, implement task by task, close with proof and a Risk line. Use for every feature, fix or change request; small work skips the paperwork.
---

# odd (Organic Driven Development)

Explore first, implement, then check in proportion to the work. Ceremony follows size: **small work goes straight to a test with no durable artifact; large work is written down before the first edit.** Runs on every request; the user never has to ask for a plan.

## The protocol (in this order)

1. **Authorize.** Investigation, explanation, review, audit, comparison and proposal requests are **read-only**: inspect, explain and recommend, but write nothing, delegate no writer and create no files. Change is authorized only by an explicit request to implement or change something. If intent is ambiguous or conditional, ask one question and stay read-only until answered.
2. **Explore.** Read the existing code and requirements, scaled to the request, before proposing or writing. Explore only for a map you need to decide or route; never to read files you will read anyway before writing.
3. **Resolve uncertainty.** Name the uncertainty first. Research a named gap (primary sources, facts separated from assumptions, read-only). Ask **one** focused question only for a real product or design decision, then stop and wait. For one high-consequence unproven premise you may run at most one scoped, read-only assumption challenge; deterministic failures are fixed, not debated.
4. **Classify.** Size the task (next section). Small stays inline and creates no durable artifact.
5. **Track.** For large work, before the first write create `odd/tasks/<feature-name>.md` from `odd/tasks/_template.md` and tell the user in one line which document and how many tasks. Do not ask permission for this.
6. **Implement.** One task at a time through the smallest useful route (below), tests first via `tdd-loop`, proportionate checks, commit in reviewable slices.
7. **Close.** Report the verified outcome, every failed, skipped or pending check, the Risk line and the next step. Blocked or missing proof becomes **one** "Needs your decision" result naming the open blockers; never more verification loops.

## Sizing

A task is **small** when all three hold:

1. **Understood**: the outcome is specified, you know what and where to change, and no product or design decision is open. Prove it within one bounded read (about 3 calls, about 10k tokens).
2. **Contained risk**: it touches none of the high-risk items below.
3. **Resumable from the diff**: if the session stopped now, someone could finish it from the user's request and `git diff` alone.

It is **large** only when that resume test fails: several sessions, waiting on something external, separate deliverables the user wants apart, or requirements too long to survive a context compaction. Never decide size by the number of files, commands, tests, fixes or a requested todo list: one understood change can span many files and still be small.

### High-risk items (hard to detect, hard to undo, or reaching beyond the change)

1. **Data or irreversible effects**: migrations, changing or deleting stored data, persisted format changes (saving new records is not).
2. **Security**: auth, permissions, credentials, secrets, guards.
3. **Contracts others consume**: changing or removing public API, CLI flags, config formats, published exports (adding an optional flag or field is not).
4. **Concurrency**: locks, races, async ordering.
5. **Delivery or environment**: installers, release, CI, deploy, dependencies.
6. **No test would catch** a regression in what changes.

If a bounded look cannot tell whether an item applies, treat it as high risk.

## The feature document: `odd/tasks/<feature-name>.md`

Fixed order, stable parts first and the growing log last. Validated by `node scripts/odd.js check <file>` and, on every write, by the `odd-lint` hook.

- **Header** (2-3 lines): objective, branch, delivery strategy, test runner.
- **IDs**: specs are `S#`, tasks are `T#`, log entries are `L#`; they are stable and never renumbered.
- **`## Specs`**: numbered `S#`. Quote the user's exact strings, error messages, commands and examples **verbatim**, in their language; number and order them but never reword. Do not add requirements nobody asked for; mark assumptions as assumptions.
- **`## Tasks`**: one line per task: `- [ ] T1 (S1,S2) <outcome> — route: inline · commit: — · done when: <observable check>`. Every task links at least one `S#`, every `S#` is covered by a task, every task declares its route (`inline` or `delegated`).
- **`## Log`** (last): `L1` is the user's original request, **verbatim**. Append later corrections, evidence and decisions with the date. Keep concise rationale for meaningful accepted changes only; it is not a second plan.
- **`## Needs your decision`** (only when blocked): one bullet per open blocker.

Rules:
- Tick a task only after its outcome and checks were **observed**; record its commit (or the RED/GREEN evidence) on the task line.
- A requirement change appends its Log entry verbatim, rewrites only the affected `S#` and reopens only its task. Findings alone never authorize scope expansion.
- Mirror the full document to memory under the topic `odd/<feature-name>/tasks` (see skill `memory`). Write the local file first, read both back, and mark the mirror pending if memory is unavailable; never claim success you did not observe.
- **Resume** an interrupted feature with `/swiftcraft:status`: memory context, then a search scoped to the project and feature, then the full saved document, then the actual file; reconcile with the code and `git log` before the next task.

## The next step is derived from the document

`/swiftcraft:status` (`node scripts/odd.js status [--json]`) computes the state from the feature document alone, so any session can resume without relying on conversation memory. The same output is shown at session start.

| State | When | The one next action |
|-------|------|---------------------|
| `needs-decision` | The document is malformed, has no tasks, or lists open items under `## Needs your decision`. The state is never guessed. | Fix the document or resolve the decision |
| `working` | At least one task is open | `/swiftcraft:build <next task>` |
| `checking` | Every task is ticked but the Log has no `Closed:` entry | Run the full suite and `/swiftcraft:review`, then add a Log entry starting with `Closed:` (verified outcome and Risk line) |
| `ready` | Every task is ticked and the Log has a `Closed:` entry | Deliver in reviewable commits; push, PR and merge stay the user's decision |

## Implement: pick the route

Every authorized change takes exactly one route. **Inline is the default**: you write it yourself, following the feature document. Delegate only for a **named reason**:

| Reason | When it holds | What to delegate |
|--------|---------------|------------------|
| Mapping | Understanding needs more than about 10k tokens of evidence or about 5 sequential lookups | One read-only explorer; handoff of about 2k tokens with `path:line` evidence; re-evaluate the size afterwards |
| Parallel units | Two or more **independent** units of behavior with disjoint edit surfaces, each needing several minutes (several files or about 100+ changed lines), launched together | One writer per unit; the prompt names the helpers to reuse and the invariants to keep |
| Context | The session is long (about 150k tokens, advisory) | The next bounded unit |
| Verification | A change that names a high-risk item, after its own checks | One independent verifier, as rarely as possible |

Never delegate for size, a large task alone, file count or cost. Hand off **by reference**: `Spec: odd/tasks/<feature>.md, T2, S3-S4`; the worker reads the document up to `## Log` and reports which `S#` it covered. Units of about 100 changed lines or less always run inline.

Task rules (see `tdd-loop`): observe RED first when a runnable test and a clear outcome exist; one RED test per requested rule; each test asserts every observable effect through the public interface; changing shared code gets a test that the previous behavior still holds; update help text and docs when a command, option or message changes.

## Deliver in slices

Commit each work unit in reviewable slices of about 400 authored changed lines (additions plus deletions). This is advisory, never a cap: if the clear solution is larger, say why and continue; never strip tests, comments or whitespace, or split artificially to fit. Tests and docs travel with the behavior. A unit whose Risk line names a high-risk item gets its own commit so `/swiftcraft:review` can take it alone. Work on a branch, not the default branch. Pushing, opening a PR and merging stay the user's decisions; follow the repository's contribution rules.

## Close with the Risk line

Every code change, small or large, ends with `Risk: none` or `Risk: item N (reason)`. Before writing `Risk: none`, check whether the diff changes code that behavior the request did not mention also uses (shared helpers, parsers, options): if so, that is item 3. **Any item named means `/swiftcraft:review` runs before the commit.**

## Rules

- Read-only requests stay read-only. Ask only for real decisions, one question at a time.
- Work that grows mid-way and stops passing the three small conditions switches to the large path.
- Do not claim a check you did not run. Failed, skipped and pending checks are reported as such.
