#!/usr/bin/env node
// Stop: if meaningful work happened (>= THRESHOLD edits) and nothing was saved to memory,
// block the stop ONCE and ask the agent to save before giving the final answer.
// Loop-safe: honours stop_hook_active and remembers the edit count it already nudged for.
// Opt out with SWIFTCRAFT_NO_NUDGE=1. Threshold: SWIFTCRAFT_NUDGE_EDITS (default 3).
const fs = require("fs");
const os = require("os");
const path = require("path");

if (process.env.SWIFTCRAFT_NO_NUDGE === "1") process.exit(0);
const THRESHOLD = Number(process.env.SWIFTCRAFT_NUDGE_EDITS || 3);

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  if (input.stop_hook_active) process.exit(0);

  const file = path.join(process.env.SWIFTCRAFT_STATE_DIR || os.tmpdir(), `swiftcraft-${String(input.session_id || "nosession").replace(/[^\w-]/g, "")}.json`);
  let st = { edits: 0, nudgedAt: 0 };
  try {
    st = { ...st, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {
    process.exit(0);
  }
  if (st.edits < THRESHOLD || st.nudgedAt >= st.edits) process.exit(0);

  st.nudgedAt = st.edits;
  try {
    fs.writeFileSync(file, JSON.stringify(st));
  } catch {}

  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason:
        "swiftcraft memory: this session changed files but nothing was saved to memory. " +
        "Follow the `memory` skill now: mem_save for each decision/fix/discovery, then mem_session_summary " +
        "(if Engram mem_* tools are unavailable, append to docs/memory/). Then give the complete final answer.",
    })
  );
  process.exit(0);
});
