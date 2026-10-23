---
description: Run the ODD workflow on a request (authorize, explore, size, track, implement task by task, close)
argument-hint: <what you want>
---

Use the `odd` skill for: $ARGUMENTS

Follow its protocol in order. Stay read-only unless the request explicitly asks for a change. Size the work first: if it is **small**, say so in one line and go straight to a test with `tdd-loop` (no feature document); if it is **large**, create `odd/tasks/<feature-name>.md` in exactly the format of `${CLAUDE_PLUGIN_ROOT}/templates/project/odd/tasks/_template.md` (sections `## Specs`, `## Tasks`, `## Log`; the full example is in the skill), with the user's exact words, tell the user in one line which document and how many tasks, then implement one task at a time. Ask at most one question, only for a real decision, and stop for the answer.
