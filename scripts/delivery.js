#!/usr/bin/env node
// /swiftcraft:commit and /swiftcraft:pr helper. It only READS the repository.
//   node delivery.js plan [--json]                    reviewable commit units, branch check, risk, secrets
//   node delivery.js check-message "<msg>" | --file f  Conventional Commits + no AI attribution
//   node delivery.js validate [--out f]               run the test/lint/typecheck/build commands the project states
//   node delivery.js pr-body [--base b] [--validated f]  pull request description (stdout)
// Commits, pushes, pull requests and merges are never made here: the user confirms them.
const fs = require("fs");
const path = require("path");
const { plan, formatPlan, checkMessage, validate, prBody } = require("./lib/delivery.js");
const { scan } = require("./lib/adopt.js");

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const cwd = process.cwd();
const fail = (m) => {
  console.error(m);
  process.exit(1);
};

if (cmd === "plan") {
  const p = plan(cwd);
  if (p.error) fail(p.error);
  console.log(args.includes("--json") ? JSON.stringify(p, null, 2) : formatPlan(p));
} else if (cmd === "check-message") {
  const file = flag("--file");
  const msg = file ? fs.readFileSync(file, "utf8") : args.slice(1).filter((a) => !a.startsWith("--")).join(" ");
  const problems = checkMessage(msg);
  if (problems.length) {
    for (const x of problems) console.log(`- ${x}`);
    process.exit(1);
  }
  console.log("Commit message OK.");
} else if (cmd === "validate") {
  const commands = scan(cwd).observed.commands;
  const v = validate(cwd, commands);
  if (!v.validated) console.log("No test, lint, typecheck or build command is stated by this project, so nothing was validated. Say how the tests are run before claiming they pass.");
  for (const r of v.results) {
    console.log(`${r.ok ? "PASS" : "FAIL"} ${r.command}${r.ok ? "" : ` (exit ${r.exitCode})`}`);
    if (!r.ok && r.tail) console.log(r.tail.split("\n").map((l) => `    ${l}`).join("\n"));
  }
  const out = flag("--out");
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(v, null, 2));
  }
  process.exit(v.results.some((r) => !r.ok) ? 1 : 0);
} else if (cmd === "pr-body") {
  const vf = flag("--validated");
  let validation = null;
  if (vf) {
    try {
      validation = JSON.parse(fs.readFileSync(vf, "utf8"));
    } catch {
      fail(`Could not read the validation results at ${vf}.`);
    }
  }
  const r = prBody({ cwd, base: flag("--base"), validation });
  if (r.error) fail(r.error);
  console.log(r.body);
} else {
  fail('Usage: node delivery.js plan [--json] | check-message "<msg>" | validate [--out f] | pr-body [--base b] [--validated f]');
}
