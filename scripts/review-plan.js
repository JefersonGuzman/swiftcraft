#!/usr/bin/env node
// node review-plan.js [--base <branch>] [--json]
// Read-only: classifies the current changes (working tree, or the branch against --base) by risk and prints how many
// independent reviewers to run, with which lenses, and a rough cost to tell the user before starting.
const { workingChanges, branchChanges, repoRoot, git } = require("./lib/delivery.js");
const { reviewPlan, formatPlan } = require("./lib/review-plan.js");

const args = process.argv.slice(2);
const i = args.indexOf("--base");
const base = i >= 0 ? args[i + 1] : null;
const root = repoRoot(process.cwd());
if (!root) {
  console.error("Not a git repository: run this from inside the project.");
  process.exit(1);
}
if (base && !git(["rev-parse", "--verify", "-q", base], root).ok) {
  console.error(`The base "${base}" does not exist here.`);
  process.exit(1);
}
const plan = reviewPlan(base ? branchChanges(root, base) : workingChanges(root));
console.log(args.includes("--json") ? JSON.stringify(plan, null, 2) : formatPlan(plan));
