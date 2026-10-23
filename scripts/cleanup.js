#!/usr/bin/env node
// Remove the scratch files swiftcraft leaves in the OS temp folder. DRY RUN unless --apply is given.
//   node cleanup.js [--apply] [--older-than <hours>] [--dir <scratch folder>]
//   --older-than   age limit for pull-request scratch folders (default 24); state files always wait at least 7 days
//   --dir          one specific scratch folder (any age); it must be swiftcraft-pr-<number>-<random> directly in the temp folder
// Only swiftcraft's own names are touched; symlinks are never followed; errors are printed and make the exit code 1.
const os = require("os");
const { cleanup } = require("./lib/cleanup.js");

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] === undefined ? "" : argv[i + 1]) : null;
};
const apply = argv.includes("--apply");
const rawAge = opt("--older-than");
let olderThanHours = 24;
if (rawAge !== null) {
  olderThanHours = rawAge.trim() === "" ? NaN : Number(rawAge);
  if (!Number.isFinite(olderThanHours) || olderThanHours <= 0) {
    console.error("--older-than needs a positive number of hours (for example --older-than 24).");
    process.exit(1);
  }
}
const dir = opt("--dir");
if (dir === "") {
  console.error("--dir needs the path of a scratch folder.");
  process.exit(1);
}

const r = cleanup({ tmpRoot: process.env.SWIFTCRAFT_TMP_DIR || os.tmpdir(), apply, olderThanHours, dir });
const h = (t) => `${t.ageHours.toFixed(1)} h old`;

console.log(`swiftcraft cleanup (${apply ? "apply" : "dry run: nothing is deleted without --apply"}) — ${r.root}`);
for (const t of r.wouldDelete) console.log(`would delete: ${t.path} (${h(t)})`);
for (const t of r.deleted) console.log(`deleted: ${t.path} (${h(t)})`);
for (const i of r.ignored) console.log(`ignored: ${i.name} (${i.reason})`);
for (const e of [...r.refused, ...r.errors]) console.error(`error: ${e.error}${e.path && !e.error.includes(e.path) ? ` — ${e.path}` : ""}`);

const n = apply ? r.deleted.length : r.wouldDelete.length;
const problems = r.refused.length + r.errors.length;
console.log(`\nSummary: ${n} ${apply ? "deleted" : "would be deleted"}, ${r.keptRecent} kept (recent), ${r.ignored.length} ignored, ${problems} error(s).`);
process.exit(problems ? 1 : 0);
