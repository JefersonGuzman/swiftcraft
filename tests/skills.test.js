const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");

test("spec-first classifies task size before writing any spec", () => {
  const s = read("skills", "spec-first", "SKILL.md");
  assert.match(s, /## Step 0: classify the size/);
  assert.match(s, /\*\*Small\*\*/);
  assert.match(s, /\*\*Large\*\*/);
  // the three conditions of a small task
  assert.match(s, /Understood/);
  assert.match(s, /Contained risk/);
  assert.match(s, /Resumable from the diff/);
  // size is never decided by counting files
  assert.match(s, /never .*(number of files|file count)/is);
  // small path creates no spec files
  assert.match(s, /no spec files/i);
});

test("spec-first lists the high-risk items and the Risk line", () => {
  const s = read("skills", "spec-first", "SKILL.md");
  for (const item of ["Data or irreversible effects", "Security", "Contracts others consume", "Concurrency", "Delivery or environment", "No test would catch"]) {
    assert.match(s, new RegExp(item), `missing high-risk item: ${item}`);
  }
  assert.match(s, /Risk: none/);
  assert.match(s, /Risk: item/);
  assert.match(s, /\/swiftcraft:review/);
});

test("spec-first keeps the user's exact words and a Log for large tasks", () => {
  const s = read("skills", "spec-first", "SKILL.md");
  assert.match(s, /verbatim/i);
  assert.match(s, /## Log/);
  assert.match(s, /L1/);
});

test("tdd-loop closes with the Risk line", () => {
  assert.match(read("skills", "tdd-loop", "SKILL.md"), /Risk: none/);
});

test("spec command and templates follow the size rule", () => {
  assert.match(read("commands", "spec.md"), /size/i);
  const spec = read("templates", "project", "specs", "_template", "spec.md");
  assert.match(spec, /## Log/);
  assert.match(spec, /L1/);
  const agents = read("templates", "project", "AGENTS.md");
  assert.match(agents, /small/i);
  assert.match(agents, /large/i);
  const constitution = read("templates", "project", "docs", "constitution.md");
  assert.doesNotMatch(constitution, /No feature without an approved/);
  assert.match(constitution, /Size first/);
});
