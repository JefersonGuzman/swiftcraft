#!/usr/bin/env node
// /swiftcraft:adopt helper for projects that already exist.
//   node adopt.js scan [dir] [--json]   READ-ONLY analysis: observed facts, inferences, uncertainties, conflicts
//   node adopt.js propose [dir]         write draft documents to docs/proposed/ (new files only, never overwrites)
// Nothing else is ever created or changed, and the contents of .env files are never read.
const fs = require("fs");
const path = require("path");
const { scan, propose } = require("./lib/adopt.js");

const args = process.argv.slice(2);
const cmd = args[0];
const json = args.includes("--json");
const dir = path.resolve(args.slice(1).find((a) => !a.startsWith("--")) || process.cwd());

if (!["scan", "propose"].includes(cmd)) {
  console.error("Usage: node adopt.js scan [dir] [--json] | node adopt.js propose [dir]");
  process.exit(1);
}
if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
  console.error(`Not a directory: ${dir}`);
  process.exit(1);
}

const r = scan(dir);

if (cmd === "propose") {
  const { written, skipped } = propose(dir, path.join(__dirname, "..", "templates"), r);
  for (const w of written) console.log(`wrote ${w}`);
  for (const s of skipped) console.log(`skipped ${s} (already exists; adopt never overwrites)`);
  console.log(`\nDrafts are in docs/proposed/. Review and edit them; every UNKNOWN is something the project did not state.`);
  process.exit(0);
}

if (json) {
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}

const o = r.observed;
const line = (label, value) => value && console.log(`  ${label}: ${value}`);
console.log(`swiftcraft adopt — scan of ${dir} (read-only: nothing is changed)\n`);
console.log("Observed");
line("Files scanned", `${o.files}${r.truncated ? " (truncated)" : ""}`);
line("Languages", o.languages.slice(0, 5).map((l) => `${l.name} (${l.files})`).join(", "));
line("Manifests", o.manifests.join(", "));
line("Package manager", o.packageManager);
line("Commands the project states", Object.entries(o.commands).map(([k, v]) => `${k}: ${v}`).join(" · "));
for (const s of o.subprojects) line(`Subproject ${s.dir}`, `${s.manifests.join(", ")}${Object.keys(s.commands).length ? ` · ${Object.entries(s.commands).map(([k, v]) => `${k}: ${v}`).join(" · ")}` : ""}`);
line("CI runs", o.ci.length ? o.ci[0].commands.slice(0, 6).join("; ") : "");
line("Tooling", o.tooling.join(", "));
line("Tests", `${o.tests.files} test file(s)${o.tests.dirs.length ? `, folders: ${o.tests.dirs.join(", ")}` : ""}`);
line("Top-level folders", o.structure.topLevel.join(", "));
line("Layer-like folders", o.structure.layerDirs.join(", "));
line("Docs present", Object.entries(o.docs).filter(([, v]) => v).map(([k]) => k).join(", "));
line("Git", o.git.isRepo ? `branch ${o.git.branch}, ${o.git.commits} commits${o.git.conventionalRatio !== null ? `, ${Math.round(o.git.conventionalRatio * 100)}% conventional (last ${o.git.recentCommits})` : ""}` : "not a repository");
line("Env files (contents never read)", `${o.env.example ? ".env.example " : ""}${o.env.local.join(" ")}`.trim());
console.log("\nInferred (conclusions from the facts above; verify before relying on them)");
for (const i of r.inferred) console.log(`  [${i.confidence}] ${i.claim} — evidence: ${i.evidence.join("; ")}`);
if (!r.inferred.length) console.log("  nothing could be inferred");
console.log("\nUncertain (needs a person)");
for (const u of r.uncertainties) console.log(`  - ${u}`);
if (!r.uncertainties.length) console.log("  - none found");
if (r.conflicts.length) {
  console.log("\nConflicts");
  for (const c of r.conflicts) console.log(`  - ${c}`);
}
