#!/usr/bin/env node
// Print the CHANGELOG section for one version (used to build GitHub release notes).
// Usage: node changelog-notes.js <x.y.z> [--file CHANGELOG.md]
const fs = require("fs");
const path = require("path");
const { changelogSection } = require("./lib/version.js");

const args = process.argv.slice(2);
const version = args.find((a) => /^\d+\.\d+\.\d+$/.test(a));
const fi = args.indexOf("--file");
const file = fi >= 0 ? args[fi + 1] : path.join(__dirname, "..", "CHANGELOG.md");

if (!version) {
  console.error("Usage: node changelog-notes.js <x.y.z> [--file CHANGELOG.md]");
  process.exit(1);
}
const notes = changelogSection(fs.readFileSync(file, "utf8"), version);
if (!notes) {
  console.error(`No CHANGELOG section for ${version}.`);
  process.exit(1);
}
console.log(notes);
