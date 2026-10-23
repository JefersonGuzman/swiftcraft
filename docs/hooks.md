# Hooks: what swiftcraft uses and what it deliberately does not

Claude Code offers many hook events. A hook is worth shipping when it enforces something an instruction cannot guarantee, is cheap, and rarely gets in the way. This page records the decision for each event, so a gap is a choice and not an oversight.

## In use

| Event | Script | What it does |
|-------|--------|--------------|
| SessionStart (+compact) | `session-start.js` | Injects the project rules, the active feature, its state and next action |
| SessionStart | `scripts/update-check.js --notice` | Once a day, tells you a newer release exists |
| UserPromptSubmit | `prompt-guard.js` | Blocks a prompt that contains a token or private key before it reaches the model (escape hatch `SWIFTCRAFT_NO_PROMPT_SCAN=1`) |
| PreToolUse Bash, PowerShell | `command-guard.js` | Blocks catastrophic commands, asks before risky ones |
| PreToolUse Read, Grep | `read-guard.js` | Asks before a secret or credential file is read (`.env`, keys, `.npmrc`, `.aws/credentials`) |
| PreToolUse Write, Edit, MultiEdit | `protect-files.js` | Blocks writes to secret and key files |
| PreToolUse Write, Edit, MultiEdit | `settings-guard.js` | Asks before `.claude/settings*.json` is changed, since hooks and permissions live there |
| PostToolUse Write, Edit, MultiEdit | `arch-lint.js` | Dependency rule in `domain/` and `application/` |
| PostToolUse Write, Edit, MultiEdit | `odd-lint.js` | Validates feature documents in `odd/tasks/` |
| PostToolUse Write, Edit, MultiEdit, memory tools | `memory-track.js` | Counts edits and saves for the memory reminder |
| PostToolUse Agent, Task, Skill | `review-track.js` | Records which sensitive diff a review covered |
| Stop | `review-reminder.js` | Asks for a review once per sensitive diff |
| Stop | `memory-nudge.js` | Asks to save memory after a session with edits |

Every hook fails open on bad input: it never blocks because of a bug in itself. `ask` hooks do not approve anything; silence leaves the normal permission flow in place.

## Considered and not used

| Event | Why not |
|-------|---------|
| SessionEnd | Only side effects; the temp state is already pruned by `memory-track.js` and cleaned on demand with `scripts/cleanup.js`. Deleting files automatically at exit would be more intrusive than useful |
| PreCompact | Blocking compaction until a task is saved is disruptive. The `SessionStart` compact hook re-injects the feature state from the feature document, which is written to disk as work happens |
| SubagentStop | The reviewer and pr-reviewer outputs are validated by their consumers (`pr-post.js`, `judge.js`); a second check here would duplicate them |
| PermissionRequest, PermissionDenied | Deciding permissions on the user's behalf would weaken their control; the guards only add `ask`/`deny` |
| ConfigChange | `settings-guard.js` covers the agent editing settings; changes the user makes themselves are theirs |
| PostToolUseFailure, StopFailure, Notification, MessageDisplay | Nothing to enforce; they would only add noise |
| TaskCreated, TaskCompleted, TeammateIdle | swiftcraft tracks tasks in the feature document, not in agent-team tasks |
| InstructionsLoaded, CwdChanged, DirectoryAdded, FileChanged, WorktreeCreate, WorktreeRemove, PreModelSwitch, PostModelSwitch, Elicitation, ElicitationResult, Setup, UserPromptExpansion, PostToolBatch, PostCompact | No rule of the harness depends on them |

## Not verified

These hooks are covered by tests with simulated input and, for the older ones, live runs. `prompt-guard`, `read-guard` and `settings-guard` have not been observed in a live interactive session, including how the confirmation prompt looks. Static matching on paths and token patterns has false positives and false negatives: it does not replace the platform's permissions.
