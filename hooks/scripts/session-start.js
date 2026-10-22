#!/usr/bin/env node
// SessionStart: inject the project constitution and the active ODD feature document as context.
// Stdout of a SessionStart hook is added to the model context.
// `--compact` (matcher "compact"): after compaction, re-inject only the working state (the open tasks of the
// active feature document); the memory plugin handles memory recovery.
const fs = require("fs");
const path = require("path");
const { findActiveDoc } = require("../../scripts/lib/odd.js");

const compact = process.argv.includes("--compact");
const cwd = process.cwd();
const constitution = path.join(cwd, "docs", "constitution.md");
const MEMORY_HINT =
  "Memory: use the `memory` skill (Engram mem_* tools; call mem_current_project first). " +
  "Save decisions, fixes and discoveries proactively; run mem_session_summary before finishing.\n";

const active = findActiveDoc(cwd);

function activeSummary() {
  if (!active) return "";
  const s = active.status;
  const next = s.next ? `; next: ${s.next.id} (${s.next.specs.join(",")}) ${s.next.outcome}` : "; all tasks ticked";
  return `Active feature: ${active.rel} — ${s.done}/${s.total} tasks done${next}. Resume with /swiftcraft:status.\n`;
}

if (compact) {
  if (!active) process.exit(0);
  const lines = active.status.open.slice(0, 8).map((t) => t.raw);
  process.stdout.write(
    `# swiftcraft — context restored after compaction\n${activeSummary()}` +
      (lines.length ? `Open tasks:\n${lines.join("\n")}\n` : "No open tasks.\n") +
      (active.status.needsDecision.length ? `Needs your decision:\n${active.status.needsDecision.map((d) => `- ${d}`).join("\n")}\n` : "")
  );
  process.exit(0);
}

if (!fs.existsSync(constitution)) {
  process.stdout.write(MEMORY_HINT + activeSummary());
  process.exit(0);
}

const MAX = 4000;
let text = fs.readFileSync(constitution, "utf8");
if (text.length > MAX) text = text.slice(0, MAX) + "\n…(truncated)";

process.stdout.write(
  `# swiftcraft — project rules (docs/constitution.md)\n${text}\n${activeSummary()}` +
    `\nWorkflow (ODD): /swiftcraft:odd <request> sizes the work first; small = straight to a test, large = feature document in odd/tasks/. ` +
    `/swiftcraft:build one task, /swiftcraft:review, /swiftcraft:status to resume. Record decisions with /swiftcraft:adr.\n${MEMORY_HINT}`
);
