#!/usr/bin/env node
// Stop: if the working tree has changes to sensitive areas (data, security, contracts, delivery) and no review of
// exactly that diff happened in this session, block the stop ONCE per diff and ask for /swiftcraft:review.
// Loop-safe (stop_hook_active). Opt out with SWIFTCRAFT_NO_REVIEW_REMINDER=1 or review.reminder in
// swiftcraft.config.json. Any failure lets the session end.
const { sensitiveState, readState, writeState } = require("../../scripts/lib/review-evidence.js");
const { loadConfig } = require("../../scripts/lib/config.js");
const fs = require("fs");
const os = require("os");
const path = require("path");

function sessionEdited(sessionId) {
  try {
    const f = path.join(process.env.SWIFTCRAFT_STATE_DIR || os.tmpdir(), `swiftcraft-${String(sessionId || "nosession").replace(/[^\w-]/g, "")}.json`);
    return (JSON.parse(fs.readFileSync(f, "utf8")).sessionEdits || 0) > 0;
  } catch {
    return false;
  }
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    if (input.stop_hook_active) process.exit(0);
    if (!loadConfig(input.cwd || process.cwd()).values.review.reminder) process.exit(0);
    // Only sessions that edited files are asked to review: a read-only session (an audit, a question) is not nagged
    // about a diff that was already there. memory-track counts the main agent's Write/Edit calls.
    if (!sessionEdited(input.session_id)) process.exit(0);
    const s = sensitiveState(input.cwd || process.cwd());
    if (!s || !s.files.length) process.exit(0);
    const st = readState(input.session_id);
    if (st.reviewedHash === s.hash || st.remindedHash === s.hash) process.exit(0);
    writeState(input.session_id, { ...st, remindedHash: s.hash });
    const list = s.files.slice(0, 6).map((f) => `${f.path} (${f.items.map((i) => `item ${i.n}`).join(", ")})`).join("; ");
    process.stdout.write(
      JSON.stringify({
        decision: "block",
        reason:
          `swiftcraft review: this diff touches high-risk areas (${list}${s.files.length > 6 ? `, +${s.files.length - 6} more` : ""}) and no review of it ran in this session. ` +
          "Run /swiftcraft:review before committing, or tell the user plainly that it was skipped and why. This reminder appears once per diff.",
      })
    );
  } catch {}
  process.exit(0);
});
