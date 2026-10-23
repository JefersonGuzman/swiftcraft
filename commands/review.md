---
description: Review the current diff with a risk-tiered plan (1-2 independent reviewers, cost shown first)
---

Follow the `review-gate` skill. First run `node "${CLAUDE_PLUGIN_ROOT}/scripts/review-plan.js"` and tell the user the plan and its cost before any `reviewer` agent runs. Then run the planned reviewers with their `Lenses:` and relay the merged findings and verdict, shortest form. At most one correction round.
