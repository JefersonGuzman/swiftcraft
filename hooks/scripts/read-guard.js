#!/usr/bin/env node
// PreToolUse (Read, Grep): ask before the agent reads a secret or credential file, so its contents do not enter the
// conversation by accident. The command guard covers the shell; this covers the file tools.
// Silence is not an approval: the normal permission flow still applies. Bad input never blocks.
const { isSecretFile } = require("../../scripts/lib/secrets.js");

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    const tool = input.tool_name;
    const ti = input.tool_input || {};
    const targets = tool === "Read" ? [ti.file_path] : tool === "Grep" ? [ti.path, String(ti.glob || "").replace(/\*+/g, "")] : [];
    const hit = targets.find((t) => typeof t === "string" && t && isSecretFile(t, { read: true }));
    if (!hit) process.exit(0);
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: `swiftcraft: "${hit}" looks like a secret or credential file. Its contents would enter the conversation. Confirm only if you need it; prefer a .env.example with placeholders.`,
        },
      })
    );
  } catch {}
  process.exit(0);
});
