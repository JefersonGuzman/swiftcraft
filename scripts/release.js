#!/usr/bin/env node
// Bump the version everywhere and stamp the CHANGELOG.
// Usage: node scripts/release.js <major|minor|patch|x.y.z>
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const files = ["package.json", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json"];
const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node scripts/release.js <major|minor|patch|x.y.z>");
  process.exit(1);
}

const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
const current = read("package.json").version;
let next = arg;
if (["major", "minor", "patch"].includes(arg)) {
  const [ma, mi, pa] = current.split(".").map(Number);
  next = arg === "major" ? `${ma + 1}.0.0` : arg === "minor" ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`;
}
if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`Invalid version: ${next}`);
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
console.log(`CHANGELOG.md stamped ${next}. Next: git commit -m "chore(release): v${next}" && git tag v${next}`);
