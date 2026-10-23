#!/usr/bin/env node
// Bump the version everywhere and stamp the CHANGELOG.
// Usage: node scripts/release.js <major|minor|patch|beta|x.y.z|x.y.z-beta.N>
//   beta   x.y.z -> x.(y+1).0-beta.1, or the next beta of a prerelease (published as a GitHub prerelease)
//   from a prerelease, major/minor/patch publish its stable version
const fs = require("fs");
const path = require("path");
const { bump } = require("./lib/version.js");

const root = path.join(__dirname, "..");
const files = ["package.json", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json"];
const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node scripts/release.js <major|minor|patch|beta|x.y.z|x.y.z-beta.N>");
  process.exit(1);
}

const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
const current = read("package.json").version;
let next;
try {
  next = bump(current, arg);
} catch (e) {
  console.error(`Invalid version: ${arg} (${e.message})`);
  process.exit(1);
}

for (const f of files) {
  const p = path.join(root, f);
  const json = read(f);
  json.version = next;
  fs.writeFileSync(p, JSON.stringify(json, null, 2) + "\n");
  console.log(`${f}: ${current} -> ${next}`);
}

const clPath = path.join(root, "CHANGELOG.md");
const cl = fs.readFileSync(clPath, "utf8");
if (!cl.includes("## [Unreleased]")) {
  console.error("CHANGELOG.md has no [Unreleased] section; version files were bumped, fix the changelog by hand.");
  process.exit(1);
}
const date = new Date().toISOString().slice(0, 10);
fs.writeFileSync(clPath, cl.replace("## [Unreleased]", `## [Unreleased]\n\n## [${next}] - ${date}`));
console.log(`CHANGELOG.md stamped ${next}. Next: git commit -am "chore(release): v${next}", push this release branch, open a PR, merge it, then on main: git pull && claude plugin tag --push`);
