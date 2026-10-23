#!/usr/bin/env node
// PostToolUse (Agent|Task|Skill): when the review skill or a swiftcraft reviewer ran, remember which sensitive diff
// it covered so the Stop reminder stays quiet for exactly that diff. Never blocks. Calls made by subagents are ignored.
const { sensitiveState, readState, writeState, isReviewCall } = require("../../scripts/lib/review-evidence.js");

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    if (input.agent_id || !isReviewCall(String(input.tool_name || ""), input.tool_input)) process.exit(0);
    const s = sensitiveState(input.cwd || process.cwd());
    if (!s) process.exit(0);
    const st = readState(input.session_id);
    writeState(input.session_id, { ...st, reviewedHash: s.hash });
  } catch {}
  process.exit(0);
});
