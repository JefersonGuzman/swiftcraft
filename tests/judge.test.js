const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { tmp } = require("./helpers.js");

const root = path.join(__dirname, "..");
const { judge, validateFindings } = require("../scripts/lib/judge.js");

const f = (file, line, severity, problem, extra = {}) => ({ file, line, severity, problem, fix: "fix it", ...extra });

test("the same problem at about the same place from both reviewers is coincident", () => {
  const a = [f("src/a.js", 10, "blocker", "SQL built from input")];
  const b = [f("src/a.js", 12, "blocker", "query concatenates user input")];
  const r = judge(a, b);
  assert.strictEqual(r.coincident.length, 1);
  assert.deepStrictEqual(r.coincident[0].sources, ["A", "B"]);
  assert.strictEqual(r.discrepant.length + r.unconfirmed.length, 0);
  assert.strictEqual(r.verdict, "fix first");
});

test("same place with different severity is discrepant and keeps both opinions", () => {
  const r = judge([f("src/a.js", 10, "blocker", "no auth check")], [f("src/a.js", 10, "nit", "auth check style")]);
  assert.strictEqual(r.discrepant.length, 1);
  assert.strictEqual(r.discrepant[0].a.severity, "blocker");
  assert.strictEqual(r.discrepant[0].b.severity, "nit");
  assert.strictEqual(r.verdict, "needs human decision");
});

test("a finding only one reviewer made is unconfirmed, and says who made it", () => {
  const r = judge([f("src/a.js", 10, "should", "missing null check")], [f("src/b.js", 5, "should", "dead code")]);
  assert.strictEqual(r.coincident.length, 0);
  assert.deepStrictEqual(r.unconfirmed.map((x) => x.source).sort(), ["A", "B"]);
  assert.strictEqual(r.verdict, "ready with open questions");
});

test("an unconfirmed blocker is never silently dropped: it needs a human decision", () => {
  const r = judge([f("src/a.js", 10, "blocker", "data loss on retry")], []);
  assert.strictEqual(r.unconfirmed.length, 1);
  assert.strictEqual(r.verdict, "needs human decision");
});

test("no findings from either reviewer is ready", () => {
  const r = judge([], []);
  assert.strictEqual(r.verdict, "ready");
});

test("lines far apart in the same file are different findings; quotes match regardless of line", () => {
  assert.strictEqual(judge([f("a.js", 10, "should", "x")], [f("a.js", 80, "should", "x")]).coincident.length, 0);
  assert.strictEqual(judge([f("a.js", 10, "should", "x", { quote: "const q = `select ${id}`" })], [f("a.js", 80, "should", "y", { quote: "const q = `select ${id}`" })]).coincident.length, 1);
});

test("each finding is matched at most once and the result is deterministic", () => {
  const a = [f("a.js", 10, "should", "p"), f("a.js", 11, "should", "q")];
  const b = [f("a.js", 10, "should", "p")];
  const r = judge(a, b);
  assert.strictEqual(r.coincident.length, 1);
  assert.strictEqual(r.unconfirmed.length, 1);
  assert.deepStrictEqual(judge(a, b), judge(a, b));
  assert.deepStrictEqual(judge(a, b), judge(a.slice().reverse(), b));
});

test("input is validated with actionable messages", () => {
  assert.match(validateFindings("nope", "A").join(" "), /A.*array/i);
  assert.match(validateFindings([{ severity: "blocker", problem: "x" }], "B").join(" "), /B.*file/);
  assert.match(validateFindings([f("a.js", 1, "huge", "x")], "A").join(" "), /severity/);
  assert.deepStrictEqual(validateFindings([f("a.js", 1, "nit", "x")], "A"), []);
  assert.deepStrictEqual(validateFindings({ findings: [f("a.js", 1, "nit", "x")] }, "A"), [], "accepts the pr-reviewer wrapper object");
});

test("secrets in findings are redacted in the output", () => {
  const token = "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
  const r = judge([f("a.js", 1, "blocker", `token ${token} committed`)], []);
  assert.ok(!JSON.stringify(r).includes(token));
});

test("CLI merges two files, prints a readable report and exits 1 on bad input", () => {
  const d = tmp("sc-judge-");
  const a = path.join(d, "a.json");
  const b = path.join(d, "b.json");
  fs.writeFileSync(a, JSON.stringify([f("src/a.js", 10, "blocker", "SQL built from input"), f("src/c.js", 3, "nit", "naming")]));
  fs.writeFileSync(b, JSON.stringify({ findings: [f("src/a.js", 11, "blocker", "query concatenation")] }));
  const run = (...args) => spawnSync(process.execPath, [path.join(root, "scripts", "judge.js"), ...args], { encoding: "utf8" });
  const r = run(a, b);
  assert.strictEqual(r.status, 0, r.stderr);
  for (const h of ["Coincident", "Discrepant", "Unconfirmed", "Verdict: fix first"]) assert.match(r.stdout, new RegExp(h));
  assert.strictEqual(JSON.parse(run(a, b, "--json").stdout).coincident.length, 1);
  fs.writeFileSync(b, "{ nope");
  assert.strictEqual(run(a, b).status, 1);
  assert.strictEqual(run(a).status, 1);
});

test("the command is user-invoked, optional, tells the cost first and keeps the reviewers independent", () => {
  const cmd = fs.readFileSync(path.join(root, "commands", "judge.md"), "utf8");
  assert.match(cmd, /judge\.js/);
  assert.match(cmd, /cost/i);
  assert.match(cmd, /independent/i);
  assert.match(cmd, /optional/i);
  assert.match(fs.readFileSync(path.join(root, "README.md"), "utf8"), /\/swiftcraft:judge/);
});
