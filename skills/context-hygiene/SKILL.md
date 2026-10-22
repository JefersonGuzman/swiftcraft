---
name: context-hygiene
description: Keep the session lean and resumable. Use in long sessions, before big tasks, or when context feels bloated or after a compaction.
---

# context-hygiene

- **One task per turn.** Finish and verify it before starting the next.
- **Read narrow.** Use search and line ranges instead of whole files; read a file once.
- **Delegate noise.** Broad exploration or long test/build output goes to a subagent (`explorer`) that returns a summary with `path:line` evidence.
- **Write state to disk, not to chat.** Progress lives in the feature document `odd/tasks/<feature-name>.md`; decisions in `docs/adr/`. A new session resumes from those plus `git diff` (`/swiftcraft:status`).
- **Checkpoint before compaction or stopping:** update the feature document, note the next step in one line, list unverified claims.
- **Don't repeat settled decisions.** Re-read the ADR instead of re-debating.
- **Prefer short answers.** Expand only when asked.
