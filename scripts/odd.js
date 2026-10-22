#!/usr/bin/env node
// ODD feature documents (odd/tasks/<feature-name>.md).
//   node odd.js status [file]   progress, next task, pending decisions (default: the active document)
//   node odd.js check <file>    validate the document; exit 1 and list the problems if it is malformed
const fs = require("fs");
const path = require("path");
const { checkFeatureDoc, statusOf, findActiveDoc } = require("./lib/odd.js");

const [cmd, arg] = process.argv.slice(2);

function status() {
  let file;
  let rel;
  let st;
  if (arg) {
    file = path.resolve(arg);
    rel = arg;
    st = statusOf(fs.readFileSync(file, "utf8"));
  } else {
    const active = findActiveDoc(process.cwd());
    if (!active) return console.log("No feature document in odd/tasks/. Small tasks need none; large ones get one from /swiftcraft:odd.");
    file = active.file;
    rel = active.rel;
    st = active.status;
  }
  const problems = checkFeatureDoc(fs.readFileSync(file, "utf8"));
  console.log(`Feature: ${st.title || path.basename(file, ".md")}  (${rel})`);
  console.log(`Progress: ${st.done}/${st.total} tasks done`);
  if (st.next) console.log(`Next: ${st.next.id} (${st.next.specs.join(",")}) ${st.next.outcome} — route: ${st.next.route || "?"}`);
  else console.log("Next: none, every task is ticked. Close the feature: run the full suite, review, report.");
  if (st.open.length > 1) {
    console.log("Open tasks:");
    for (const t of st.open) console.log(`  - ${t.id} ${t.outcome}`);
  }
  if (st.needsDecision.length) {
    console.log("Needs your decision:");
    for (const d of st.needsDecision) console.log(`  - ${d}`);
  }
  console.log(problems.length ? `Problems: ${problems.length} (run: node odd.js check ${rel})` : "Problems: none");
}

function check() {
  if (!arg) {
    console.error("Usage: node odd.js check <file>");
    process.exit(1);
  }
  let text;
  try {
    text = fs.readFileSync(arg, "utf8");
  } catch (e) {
    console.error(`Cannot read ${arg}: ${e.message}`);
    process.exit(1);
  }
  const problems = checkFeatureDoc(text);
  if (problems.length) {
    console.log(`${arg}: ${problems.length} problem(s)`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  const st = statusOf(text);
  console.log(`OK: ${arg} (${st.total} tasks, ${st.done} done)`);
}

if (cmd === "status") status();
else if (cmd === "check") check();
else {
  console.error("Usage: node odd.js status [file] | node odd.js check <file>");
  process.exit(1);
}
