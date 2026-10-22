---
description: Size a change and, if it is not small, write spec.md (what and why, no tech)
argument-hint: <feature idea>
---

Use the `spec-first` skill for: $ARGUMENTS

First classify the size (Step 0). If it is **small**, say so in one line and offer to go straight to `/swiftcraft:build`; create no spec files unless the user asks. If it is **large**, create `specs/NNN-<slug>/spec.md` with the user's exact words quoted and `L1` in the Log, ask at most one question at a time about anything unclear, then stop for approval. Do not plan or code yet.
