#!/usr/bin/env node
// PreToolUse (Write, Edit, MultiEdit): ask before the agent edits Claude Code settings. Hooks and permissions live
// there, so changing them can switch off the protections swiftcraft adds. Bad input never blocks.
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const file = String((JSON.parse(raw).tool_input || {}).file_path || "").replace(/\\/g, "/");
    if (!/(^|\/)\.claude\/settings(\.local)?\.json$/.test(file)) process.exit(0);
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: `swiftcraft: "${file}" holds Claude Code hooks and permissions. Changing it can disable safety checks; confirm only if you asked for this change.`,
        },
      })
    );
  } catch {}
  process.exit(0);
});
