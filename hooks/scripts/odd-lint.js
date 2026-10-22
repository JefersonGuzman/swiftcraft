#!/usr/bin/env node
// PostToolUse: when a feature document (odd/tasks/<feature>.md) is written, validate its structure and feed
// the problems back to the agent (exit 2). Everything else, including the template, is ignored. Fails open.
const fs = require("fs");
const path = require("path");
const { checkFeatureDoc } = require("../../scripts/lib/odd.js");

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let file = "";
  try {
    file = (JSON.parse(raw).tool_input || {}).file_path || "";
  } catch {
    process.exit(0);
  }
  const norm = file.replace(/\\/g, "/");
  if (!/(^|\/)odd\/tasks\/[^/]+\.md$/.test(norm) || path.basename(norm).startsWith("_") || !fs.existsSync(file)) process.exit(0);
  let problems;
  try {
    problems = checkFeatureDoc(fs.readFileSync(file, "utf8"));
  } catch {
    process.exit(0);
  }
  if (problems.length) {
    process.stderr.write(`swiftcraft odd-lint: ${path.basename(file)} breaks the feature document format:\n${problems.map((p) => `  - ${p}`).join("\n")}\nFix them (see skill "odd"), or tell the user why a rule does not apply.\n`);
    process.exit(2);
  }
  process.exit(0);
});
