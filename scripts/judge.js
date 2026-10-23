#!/usr/bin/env node
// node judge.js <reviewer-a.json> <reviewer-b.json> [--json]
// Merges two independent reviews into coincident / discrepant / unconfirmed findings with a verdict. Read-only, no model.
const fs = require("fs");
const { judge, validateFindings, format } = require("./lib/judge.js");

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--"));
if (files.length !== 2) {
  console.error("Usage: node judge.js <reviewer-a.json> <reviewer-b.json> [--json]");
  process.exit(1);
}
const inputs = [];
const problems = [];
files.forEach((f, i) => {
  const label = i === 0 ? "A" : "B";
  try {
    const data = JSON.parse(fs.readFileSync(f, "utf8"));
    problems.push(...validateFindings(data, label));
    inputs.push(data);
  } catch (e) {
    problems.push(`${label}: cannot read ${f} as JSON (${e.message.split("\n")[0]}).`);
  }
});
if (problems.length) {
  for (const p of problems) console.error(p);
  process.exit(1);
}
const r = judge(inputs[0], inputs[1]);
console.log(args.includes("--json") ? JSON.stringify(r, null, 2) : format(r));
