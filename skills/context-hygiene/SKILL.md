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
- **Library and framework documentation.** If a documentation MCP is available in the session (check the tool list; never assume one exists), use it for current APIs of libraries and frameworks instead of memory. In your answer, separate "Consulted: <source>" from "From general knowledge (not verified against current docs)". With no documentation tool, say the API detail comes from general knowledge and suggest checking the official docs for anything version-sensitive.
