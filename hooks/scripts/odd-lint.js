#!/usr/bin/env node
// PostToolUse: when a feature document (odd/tasks/<feature>.md) is written, validate its structure and feed
// the problems back to the agent (exit 2). Everything else, including the template, is ignored. Fails open.
const fs = require("fs");
const path = require("path");
const { checkFeatureDoc, FORMAT_HINT } = require("../../scripts/lib/odd.js");

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
    process.stderr.write(`swiftcraft odd-lint: ${path.basename(file)} breaks the feature document format:\n${problems.map((p) => `  - ${p}`).join("\n")}\n\nFix them with the format below; it is complete, you do not need to read any other file. Rewrite the document in that shape, keeping the user's words verbatim.\n\n${FORMAT_HINT}\n`);
    process.exit(2);
  }
  process.exit(0);
});
