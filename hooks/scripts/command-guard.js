#!/usr/bin/env node
// PreToolUse (Bash and PowerShell): the command guard.
//   deny  -> the command is blocked and cannot be confirmed through the plugin
//   ask   -> the user is asked to confirm
//   none  -> silence (the normal permission flow applies; silence is not an approval)
// Output follows the documented PreToolUse format: JSON on stdout, exit code 0. Bad input never blocks.
// A project can add rules or relax ASK rules in docs/guard-rules.json; DENY rules cannot be relaxed.
// A minimal local log keeps only the decision and the rule ids (never the command text).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { evaluate } = require("../../scripts/lib/guard.js");

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  const tool = input && input.tool_name;
  const command = input && input.tool_input && input.tool_input.command;
  if (!["Bash", "PowerShell"].includes(tool) || typeof command !== "string" || !command.trim()) process.exit(0);

  const cwd = typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd();
  let config;
  try {
    config = JSON.parse(fs.readFileSync(path.join(cwd, "docs", "guard-rules.json"), "utf8"));
  } catch {
    config = undefined; // missing or invalid: the defaults apply
  }

  let result;
  try {
    result = evaluate(command, { cwd, config });
  } catch {
    result = { decision: "ask", matches: [{ id: "eval-unresolved", level: "ask", reason: "the command could not be analyzed safely" }] };
  }
  if (result.decision === "none") process.exit(0);

  const list = (level) => result.matches.filter((m) => m.level === level).map((m) => `[${m.id}] ${m.reason}`).join("; ");
  const reason =
    result.decision === "deny"
      ? `swiftcraft guard: BLOCKED. ${list("deny")}. This is never allowed through the plugin and cannot be confirmed here; if you really mean it, run it yourself in a terminal.`
      : `swiftcraft guard: this command needs your confirmation. ${list("ask")}.`;

  try {
    const logFile = path.join(process.env.SWIFTCRAFT_STATE_DIR || os.tmpdir(), "swiftcraft-guard.log");
    let lines = [];
    try {
      lines = fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean).slice(-199);
    } catch {}
    lines.push(JSON.stringify({ t: Date.now(), decision: result.decision, rules: [...new Set(result.matches.map((m) => m.id))], tool }));
    fs.writeFileSync(logFile, lines.join("\n") + "\n");
  } catch {}

  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: result.decision, permissionDecisionReason: reason } }));
  process.exit(0);
});
