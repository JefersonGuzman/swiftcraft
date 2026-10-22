#!/usr/bin/env node
// PostToolUse: count file edits per session; reset the counter when memory was saved.
// State lives in the OS temp dir, keyed by session_id. Never blocks.
const fs = require("fs");
const os = require("os");
const path = require("path");

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  // Tool calls made by subagents carry agent_id; they must not count toward the parent's nudge.
  if (input.agent_id) process.exit(0);
  const file = path.join(os.tmpdir(), `swiftcraft-${String(input.session_id || "nosession").replace(/[^\w-]/g, "")}.json`);
  let st = { edits: 0, nudgedAt: 0 };
  try {
    st = { ...st, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {}

  const tool = String(input.tool_name || "");
  const target = String((input.tool_input || {}).file_path || "").replace(/\\/g, "/");
  // File-based fallback memory (docs/memory/ or the agent's own memory dir) counts as a save.
  const isMemoryFile = /(^|\/)docs\/memory\//.test(target) || /\/\.claude\/projects\/[^/]+\/memory\//.test(target);
  if (/mem_(save|update|session_summary)$/.test(tool) || (/^(Write|Edit|MultiEdit)$/.test(tool) && isMemoryFile)) {
    st.edits = 0;
    st.nudgedAt = 0;
  } else if (/^(Write|Edit|MultiEdit)$/.test(tool)) {
    st.edits += 1;
  } else {
    process.exit(0);
  }
  try {
    fs.writeFileSync(file, JSON.stringify(st));
  } catch {}
  process.exit(0);
});
