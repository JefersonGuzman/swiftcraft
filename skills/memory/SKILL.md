---
name: memory
description: Persist and recall project knowledge across sessions with Engram (falls back to docs/memory files). Use at session start, after any decision/bugfix/discovery, and before ending a session.
---

# memory

Backend: **Engram** MCP (`mem_*` tools). If those tools are unavailable, use `docs/memory/<topic>.md` plus a one-line index in `docs/memory/INDEX.md`.

## Recall (start of work, or when the user references past work)

1. `mem_current_project` first; pass the exact returned `project` to later calls. If it is ambiguous or empty, ask the user to choose; never invent a name.
2. `mem_context` for recent history, then `mem_search` for the topic, then `mem_get_observation` for full text.

## Save (proactively, without being asked)

Call `mem_save` right after: a decision, a bug fix (with root cause), a discovery, a convention, a config change.

- Title: short and searchable (`Fix: refresh token race in auth`).
- Content: what, why, where (file paths), and how to apply it. Facts only.
- Reuse a stable topic key for evolving subjects so updates replace instead of duplicating (`mem_suggest_topic_key`, `mem_update`).
- Do not save what the repo already records (code, git history, specs, ADRs). Link to them instead.
- Never save secrets, tokens or personal data.

## Close

Before saying a task or session is done, call `mem_session_summary` (goal, done, decisions, next step). Then give the user the complete answer as the final message; saving memory is bookkeeping, never the reply. If a memory call fails, answer anyway.

## Memory vs ADR vs spec

| Content | Where |
|---------|-------|
| Why we chose X over Y, hard to reverse | ADR (`docs/adr/`), memory holds a pointer |
| What a feature must do | spec |
| Gotchas, fixes, conventions, "we tried this" | memory |
