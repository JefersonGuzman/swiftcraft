const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { tmp } = require("./helpers.js");

const root = path.join(__dirname, "..");
const { nextStep } = require("../scripts/lib/odd.js");

const WORKING = `# Table reservations
Objective: let guests book a table · Branch: feat/reservations · Delivery: ask-on-risk · Runner: npm test

## Specs
- S1: "Guests can book a table for 2-8 people"
- S2: "A booked slot cannot be double booked"

## Tasks
- [x] T1 (S1) Booking use case — route: inline · commit: a1b2c3d · done when: unit tests pass
- [ ] T2 (S2) Reject double booking — route: inline · commit: — · done when: conflict test passes

## Log
- L1 (2026-10-22) I want guests to reserve tables, max 8 people, and never double book.
`;
const ALL_TICKED = WORKING.replace("- [ ] T2", "- [x] T2").replace("commit: —", "commit: ffff111");
const CLOSED = ALL_TICKED + "- L2 (2026-10-23) Closed: 2/2 tasks verified, 70 tests pass. Risk: none\n";

test("working: open tasks give one next action pointing at the next task", () => {
  const s = nextStep(WORKING);
  assert.strictEqual(s.state, "working");
  assert.match(s.reason, /1 of 2 tasks are open/);
  assert.match(s.action, /\/swiftcraft:build T2/);
  assert.match(s.action, /Reject double booking/);
  assert.strictEqual(s.next.id, "T2");
});

test("checking: every task ticked but the feature is not closed yet", () => {
  const s = nextStep(ALL_TICKED);
  assert.strictEqual(s.state, "checking");
  assert.match(s.action, /\/swiftcraft:review/);
  assert.match(s.action, /Closed:/);
});

test("ready: a Closed: log entry with every task ticked", () => {
  const s = nextStep(CLOSED);
  assert.strictEqual(s.state, "ready");
  assert.match(s.action, /commit|pull request|deliver/i);
  assert.match(s.action, /your decision/i); // push, PR and merge stay with the user
});

test("needs-decision: open decisions are surfaced and block the state", () => {
  const s = nextStep(WORKING + "\n## Needs your decision\n- Which payment provider?\n");
  assert.strictEqual(s.state, "needs-decision");
  assert.match(s.reason, /1 open decision/);
  assert.match(s.action, /Which payment provider\?/);
});

test("needs-decision: a malformed document does not get an invented state", () => {
  const s = nextStep(WORKING.replace("- L1 (2026-10-22)", "- note"));
  assert.strictEqual(s.state, "needs-decision");
  assert.match(s.reason, /problem/i);
  assert.match(s.action, /odd\.js check/);
});

test("needs-decision: a document with no tasks is incomplete", () => {
  const s = nextStep("# Empty\n\n## Specs\n\n## Tasks\n\n## Log\n- L1 (2026-10-22) something\n");
  assert.strictEqual(s.state, "needs-decision");
  assert.match(s.reason, /no tasks/i);
});

test("needs-decision: garbage input is handled, not thrown", () => {
  assert.strictEqual(nextStep("").state, "needs-decision");
  assert.strictEqual(nextStep("just some text").state, "needs-decision");
});

test("a Closed: entry does not hide an open task: working wins", () => {
  const s = nextStep(WORKING + "- L2 (2026-10-23) Closed: too early\n");
  assert.strictEqual(s.state, "working");
});

test("the same input always produces the same output", () => {
  for (const doc of [WORKING, ALL_TICKED, CLOSED, ""]) assert.deepStrictEqual(nextStep(doc), nextStep(doc));
});

function project(doc) {
  const dir = tmp("sc-odd-state-");
  fs.mkdirSync(path.join(dir, "odd", "tasks"), { recursive: true });
  fs.writeFileSync(path.join(dir, "odd", "tasks", "reservations.md"), doc);
  return dir;
}
const odd = (args, cwd) => spawnSync("node", [path.join(root, "scripts", "odd.js"), ...args], { cwd, encoding: "utf8" });

test("odd.js status prints State, Reason and Next action", () => {
  const r = odd(["status"], project(WORKING));
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /^State: working$/m);
  assert.match(r.stdout, /^Reason: /m);
  assert.match(r.stdout, /^Next action: .*T2/m);
});

test("odd.js status --json is machine readable and consistent with the text", () => {
  const dir = project(ALL_TICKED);
  const j = JSON.parse(odd(["status", "--json"], dir).stdout);
  assert.strictEqual(j.state, "checking");
  assert.strictEqual(j.file, "odd/tasks/reservations.md");
  assert.deepStrictEqual([j.done, j.total], [2, 2]);
  assert.ok(j.action && j.reason);
});

test("odd.js status --json with no feature document reports that cleanly", () => {
  const j = JSON.parse(odd(["status", "--json"], tmp("sc-odd-none-")).stdout);
  assert.strictEqual(j.state, "none");
});

test("session-start shows the same state and next action", () => {
  const dir = project(WORKING);
  fs.mkdirSync(path.join(dir, "docs"));
  fs.writeFileSync(path.join(dir, "docs", "constitution.md"), "# Rules\nSize first.");
  const r = spawnSync("node", [path.join(root, "hooks", "scripts", "session-start.js")], { cwd: dir, encoding: "utf8" });
  assert.match(r.stdout, /state: working/);
  assert.match(r.stdout, /\/swiftcraft:build T2/);
});

test("the odd skill documents the four states and the Closed: log entry", () => {
  const s = fs.readFileSync(path.join(root, "skills", "odd", "SKILL.md"), "utf8");
  for (const state of ["working", "checking", "ready", "needs-decision"]) assert.ok(s.includes(state), `skill misses state ${state}`);
  assert.match(s, /Closed:/);
});
