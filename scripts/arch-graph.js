#!/usr/bin/env node
// node arch-graph.js check [--json]
// Whole-project import graph check (JavaScript/TypeScript, proof of concept): transitive layer violations,
// imports of another feature's internals, cycles. Read-only. Exit 1 when it finds violations.
const { checkGraph } = require("./lib/arch-graph.js");

const args = process.argv.slice(2);
if (args[0] !== "check") {
  console.error("Usage: node arch-graph.js check [--json]");
  process.exit(1);
}
const r = checkGraph(process.cwd());
if (args.includes("--json")) console.log(JSON.stringify(r, null, 2));
else {
  console.log(`swiftcraft arch-graph — ${r.files} JavaScript/TypeScript file(s) scanned (read-only)\n`);
  if (!r.violations.length) console.log("No violations found.");
  for (const v of r.violations) {
    console.log(`[${v.kind}] ${v.file} — ${v.detail}`);
    if (v.chain.length > 1) console.log(`    ${v.chain.join(" -> ")}${v.kind === "cycle" ? " (in any order)" : ""}`);
  }
}
process.exit(r.violations.length ? 1 : 0);
