const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");
const exists = (...p) => fs.existsSync(path.join(root, ...p));

test("the odd skill defines the seven-step protocol in order", () => {
  const s = read("skills", "odd", "SKILL.md");
  const steps = ["Authorize", "Explore", "Resolve uncertainty", "Classify", "Track", "Implement", "Close"];
  let last = -1;
  for (const step of steps) {
    const at = s.search(new RegExp(`^\\d\\. \\*\\*${step}`, "m"));
    assert.ok(at > last, `step "${step}" missing or out of order`);
    last = at;
  }
});

test("the odd skill keeps read-only work read-only until implementation is authorized", () => {
  const s = read("skills", "odd", "SKILL.md");
  assert.match(s, /read-only/i);
  assert.match(s, /investigation|explanation|review|audit|proposal/i);
  assert.match(s, /explicit/i);
});

test("the odd skill sizes by the three conditions, never by file count, and lists the high-risk items", () => {
  const s = read("skills", "odd", "SKILL.md");
  for (const c of ["Understood", "Contained risk", "Resumable from the diff"]) assert.match(s, new RegExp(c));
  assert.match(s, /never .*(number of files|file count)/is);
  assert.match(s, /no (spec|feature) (files|document)|no durable/i);
  for (const item of ["Data or irreversible effects", "Security", "Contracts others consume", "Concurrency", "Delivery or environment", "No test would catch"]) {
    assert.match(s, new RegExp(item), `missing high-risk item: ${item}`);
  }
});

test("the odd skill defines the feature document, task rules and resume", () => {
  const s = read("skills", "odd", "SKILL.md");
  assert.match(s, /odd\/tasks\/<feature-name>\.md/);
  for (const part of ["## Specs", "## Tasks", "## Log", "S#", "T#", "L1", "verbatim"]) assert.ok(s.includes(part), `missing ${part}`);
  assert.match(s, /odd\/<feature-name>\/tasks/); // memory mirror topic
  assert.match(s, /\/swiftcraft:status/);
  assert.match(s, /observed/i);
});

test("the odd skill allows delegation only for named reasons and closes with the Risk line", () => {
  const s = read("skills", "odd", "SKILL.md");
  assert.match(s, /named reason/i);
  assert.match(s, /parallel/i);
  assert.match(s, /independent verifier/i);
  assert.match(s, /never .*(size|file count)/is);
  assert.match(s, /Risk: none/);
  assert.match(s, /Risk: item/);
  assert.match(s, /Needs your decision/);
  assert.match(s, /\/swiftcraft:review/);
});

test("tdd-loop reports the Risk line and a differential check for shared code", () => {
  const s = read("skills", "tdd-loop", "SKILL.md");
  assert.match(s, /Risk: none/);
  assert.match(s, /differential/i);
  assert.match(s, /odd\/tasks/);
});

test("commands follow ODD: odd and status exist, spec and plan are gone", () => {
  assert.ok(exists("commands", "odd.md"));
  assert.ok(exists("commands", "status.md"));
  assert.ok(!exists("commands", "spec.md"), "commands/spec.md must be removed");
  assert.ok(!exists("commands", "plan.md"), "commands/plan.md must be removed");
  assert.ok(!exists("skills", "spec-first"), "skills/spec-first must be removed");
  assert.match(read("commands", "odd.md"), /odd/i);
  assert.match(read("commands", "status.md"), /odd\.js" status/);
});

test("project templates follow ODD", () => {
  assert.ok(exists("templates", "project", "odd", "tasks", "_template.md"));
  assert.ok(!exists("templates", "project", "specs"), "the specs template folder must be removed");
  const t = read("templates", "project", "odd", "tasks", "_template.md");
  for (const part of ["## Specs", "## Tasks", "## Log", "L1", "S1", "T1"]) assert.ok(t.includes(part), `template misses ${part}`);
  const agents = read("templates", "project", "AGENTS.md");
  assert.match(agents, /odd\/tasks/);
  assert.match(agents, /small/i);
  assert.match(agents, /large/i);
  const constitution = read("templates", "project", "docs", "constitution.md");
  assert.match(constitution, /Size first/);
  assert.doesNotMatch(constitution, /No feature without an approved/);
});

test("no leftovers of the old spec/plan/tasks files flow in the plugin", () => {
  const files = [
    ["skills", "project-start", "SKILL.md"], ["skills", "context-hygiene", "SKILL.md"], ["skills", "review-gate", "SKILL.md"],
    ["skills", "token-saver", "SKILL.md"], ["skills", "pr-review", "SKILL.md"], ["agents", "pr-reviewer.md"], ["agents", "architect.md"],
    ["commands", "build.md"], ["templates", "project", "AGENTS.md"], ["templates", "project", "CLAUDE.md"], ["README.md"],
  ];
  for (const f of files) {
    const text = read(...f);
    assert.doesNotMatch(text, /specs\/NNN|spec\.md|plan\.md|tasks\.md|\/swiftcraft:spec|\/swiftcraft:plan|spec-first/, `${f.join("/")} still mentions the old flow`);
  }
});

test("the repository never names the project this workflow was studied from", () => {
  // built from pieces so that this file does not contain the names it forbids
  const names = [["gentle", "ai"], ["gentle", "pi"], ["gentleman", "ai"]].map(([a, b]) => `${a}[-_ ]?${b}`);
  const banned = new RegExp(names.join("|"), "i");
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if ([".git", "node_modules"].includes(e.name)) return [];
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return /\.(md|json|js|yml|mdc|txt)$/.test(e.name) ? [p] : [];
    });
  const offenders = walk(root).filter((f) => banned.test(fs.readFileSync(f, "utf8")));
  assert.deepStrictEqual(offenders.map((f) => path.relative(root, f)), []);
});
