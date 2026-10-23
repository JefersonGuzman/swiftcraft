#!/usr/bin/env node
// Stop: if the working tree has changes to sensitive areas (data, security, contracts, delivery) and no review of
// exactly that diff happened in this session, block the stop ONCE per diff and ask for /swiftcraft:review.
// Loop-safe (stop_hook_active). Opt out with SWIFTCRAFT_NO_REVIEW_REMINDER=1. Any failure lets the session end.
const { sensitiveState, readState, writeState } = require("../../scripts/lib/review-evidence.js");

if (process.env.SWIFTCRAFT_NO_REVIEW_REMINDER === "1") process.exit(0);

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    if (input.stop_hook_active) process.exit(0);
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
