---
description: Optional adversarial review of the current diff by two independent reviewers, merged deterministically
---

Optional, only because the user asked for it: this runs **two** independent `reviewer` agents, so it costs about double a normal review. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/review-plan.js"` first and tell the user the cost, then wait for a go-ahead.

Start the two reviewers separately, in fresh context, **independent**: neither sees the other's output and each gets the same diff scope. Ask each to answer only with a JSON array of findings: `[{"file","line","quote","severity":"blocker|should|nit","problem","fix","lens"}]`. Save them to two temporary files and run `node "${CLAUDE_PLUGIN_ROOT}/scripts/judge.js" <a.json> <b.json>`.

Relay the report as it is: **coincident** findings (both saw it), **discrepant** ones (same place, different severity: the user decides) and **unconfirmed** ones (only one reviewer saw it, which is not proof it is wrong). Never drop an unconfirmed blocker. One correction round at most.
