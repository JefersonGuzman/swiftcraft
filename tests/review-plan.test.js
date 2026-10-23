const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { tmp } = require("./helpers.js");

const root = path.join(__dirname, "..");
const { reviewPlan, LENSES } = require("../scripts/lib/review-plan.js");

const f = (p, added = 10, removed = 0) => ({ path: p, added, removed });

test("the four lenses are defined once with a question each", () => {
  assert.deepStrictEqual(Object.keys(LENSES).sort(), ["readability", "reliability", "resilience", "risk"]);
  for (const l of Object.values(LENSES)) assert.ok(l.length > 20);
});

test("low risk: one cheap reviewer on readability", () => {
  const p = reviewPlan([f("README.md"), f("docs/a.md")]);
  assert.strictEqual(p.tier, "low");
  assert.strictEqual(p.reviewers.length, 1);
  assert.deepStrictEqual(p.reviewers[0].lenses, ["readability"]);
});

test("medium risk: one reviewer with reliability, resilience and readability", () => {
  const p = reviewPlan([f("src/a.js"), f("tests/a.test.js")]);
  assert.strictEqual(p.tier, "medium");
  assert.strictEqual(p.reviewers.length, 1);
  assert.deepStrictEqual(p.reviewers[0].lenses, ["reliability", "resilience", "readability"]);
});

test("high risk: two independent reviewers covering all four lenses, never more", () => {
  const p = reviewPlan([f("src/auth/login.js"), f("migrations/001.sql"), f("tests/a.test.js")]);
  assert.strictEqual(p.tier, "high");
  assert.strictEqual(p.reviewers.length, 2);
  assert.deepStrictEqual([...new Set(p.reviewers.flatMap((r) => r.lenses))].sort(), ["readability", "reliability", "resilience", "risk"]);
  assert.ok(p.items.length >= 2);
  const many = reviewPlan(Array.from({ length: 40 }, (_, i) => f(`src/auth/f${i}.js`)));
  assert.strictEqual(many.reviewers.length, 2);
});

test("the plan states a rough cost estimate that grows with the change, and at most one correction round", () => {
  const small = reviewPlan([f("src/a.js", 10), f("tests/a.test.js", 5)]);
  const big = reviewPlan([f("src/a.js", 900), f("tests/a.test.js", 300)]);
  assert.ok(big.estimate.totalTokens > small.estimate.totalTokens);
  assert.match(big.estimate.note, /estimate/i);
  assert.strictEqual(small.maxCorrectionRounds, 1);
  assert.deepStrictEqual(reviewPlan([f("src/a.js")]), reviewPlan([f("src/a.js")]), "deterministic");
});

test("an empty change has nothing to review", () => {
  const p = reviewPlan([]);
  assert.strictEqual(p.reviewers.length, 0);
  assert.strictEqual(p.tier, "low");
});

test("CLI prints the cost and the lenses before any reviewer runs, and --json is parseable", () => {
  const dir = tmp("sc-review-plan-");
  const g = (...a) => spawnSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { encoding: "utf8" });
  g("init", "-q", "-b", "main");
  fs.writeFileSync(path.join(dir, "a.js"), "exports.a = 1;\n");
  g("add", "-A");
  g("commit", "-q", "-m", "chore: init");
  fs.mkdirSync(path.join(dir, "src", "auth"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "auth", "login.js"), "exports.x = 1;\n");
  const run = (...a) => spawnSync(process.execPath, [path.join(root, "scripts", "review-plan.js"), ...a], { cwd: dir, encoding: "utf8" });
  const r = run();
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /high/);
  assert.match(r.stdout, /2 reviewer/);
  assert.match(r.stdout, /estimate/i);
  assert.match(r.stdout, /one correction round/i);
  const j = JSON.parse(run("--json").stdout);
  assert.strictEqual(j.tier, "high");
  assert.strictEqual(spawnSync(process.execPath, [path.join(root, "scripts", "review-plan.js")], { cwd: tmp("sc-review-plan-nogit-"), encoding: "utf8" }).status, 1);
});

test("the reviewer agent knows the lenses, stays read-only and writes nothing; the skill and command run the plan first", () => {
  const agent = fs.readFileSync(path.join(root, "agents", "reviewer.md"), "utf8");
  const tools = (agent.match(/^tools:\s*(.+)$/m) || [, ""])[1];
  assert.doesNotMatch(tools, /Write|Edit|MultiEdit|NotebookEdit/);
  for (const l of ["risk", "resilience", "readability", "reliability"]) assert.match(agent, new RegExp(l, "i"));
  assert.match(agent, /Lenses:/);
  const skill = fs.readFileSync(path.join(root, "skills", "review-gate", "SKILL.md"), "utf8");
  const cmd = fs.readFileSync(path.join(root, "commands", "review.md"), "utf8");
  for (const text of [skill, cmd]) assert.match(text, /review-plan\.js/);
  assert.match(skill, /cost/i);
  assert.match(skill, /one correction round/i);
  assert.match(skill, /read-only/i);
});
