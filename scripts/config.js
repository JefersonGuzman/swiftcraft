#!/usr/bin/env node
// node config.js show [--json]   effective swiftcraft settings for the current project, with where each value comes from
// Read-only. Exit code 1 when swiftcraft.config.json has problems (the defaults are used meanwhile).
const { loadConfig, SPEC, FILE } = require("./lib/config.js");

const args = process.argv.slice(2);
if (args[0] !== "show") {
  console.error("Usage: node config.js show [--json]");
  process.exit(1);
}
const c = loadConfig(process.cwd());
if (args.includes("--json")) {
  console.log(JSON.stringify({ file: c.file, values: c.values, sources: c.sources, errors: c.errors }, null, 2));
} else {
  console.log(`swiftcraft settings (${c.file ? c.file : `no ${FILE}: defaults`})\n`);
  for (const key of Object.keys(SPEC)) {
    const v = key.split(".").reduce((x, k) => x[k], c.values);
    console.log(`  ${key.padEnd(24)} ${String(v).padEnd(6)} (${c.sources[key]})`);
  }
  if (c.errors.length) {
    console.log(`\n${FILE} has problems and is ignored until fixed:`);
    for (const e of c.errors) console.log(`  - ${e}`);
  }
}
process.exit(c.errors.length ? 1 : 0);
