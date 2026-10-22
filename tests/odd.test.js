const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { tmp } = require("./helpers.js");

const root = path.join(__dirname, "..");
const { parseFeatureDoc, checkFeatureDoc, statusOf } = require("../scripts/lib/odd.js");

const GOOD = `# Table reservations
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

test("parseFeatureDoc reads specs, tasks and log", () => {
  const d = parseFeatureDoc(GOOD);
  assert.strictEqual(d.title, "Table reservations");
  assert.deepStrictEqual(d.specs.map((s) => s.id), ["S1", "S2"]);
  assert.strictEqual(d.specs[0].text, '"Guests can book a table for 2-8 people"');
  assert.deepStrictEqual(d.tasks.map((t) => [t.id, t.done, t.specs, t.route, t.commit]), [
    ["T1", true, ["S1"], "inline", "a1b2c3d"],
    ["T2", false, ["S2"], "inline", null],
  ]);
  assert.deepStrictEqual(d.log.map((l) => l.id), ["L1"]);
});

test("spec ranges and lists in a task link expand", () => {
  const doc = GOOD.replace("(S1)", "(S1-S2)").replace("(S2)", "(S1, S2)");
  const d = parseFeatureDoc(doc);
  assert.deepStrictEqual(d.tasks[0].specs, ["S1", "S2"]);
  assert.deepStrictEqual(d.tasks[1].specs, ["S1", "S2"]);
});

test("checkFeatureDoc accepts a well-formed document", () => {
  assert.deepStrictEqual(checkFeatureDoc(GOOD), []);
});

test("checkFeatureDoc reports each structural problem", () => {
  const has = (doc, re) => assert.ok(checkFeatureDoc(doc).some((p) => re.test(p)), `expected /${re}/ in ${JSON.stringify(checkFeatureDoc(doc))}`);
  has(GOOD.replace("- L1 (2026-10-22)", "- note"), /L1/);
  has(GOOD.replace("(S1) Booking", "() Booking"), /T1.*no linked spec/i);
  has(GOOD.replace("(S2) Reject", "(S9) Reject"), /T2.*S9.*does not exist/i);
  has(GOOD.replace("(S2) Reject", "(S1) Reject"), /S2.*not covered/i);
  has(GOOD.replace("T2 (S2)", "T1 (S2)"), /duplicate.*T1/i);
  has(GOOD.replace("commit: a1b2c3d", "commit: —"), /T1.*ticked.*commit or evidence/i);
  has(GOOD.replace("route: inline · commit: a1b2c3d", "commit: a1b2c3d"), /T1.*route/i);
  has(GOOD.replace("## Specs", "## Requirements"), /Specs/);
  has(GOOD.replace("## Log", "## Notes"), /Log/);
  const swapped = GOOD.replace("## Specs", "## TMP").replace("## Tasks", "## Specs").replace("## TMP", "## Tasks");
  has(swapped, /order/i);
});

test("a ticked task may use evidence instead of a commit", () => {
  const doc = GOOD.replace("commit: a1b2c3d", "evidence: RED->GREEN, 12 tests pass");
  assert.deepStrictEqual(checkFeatureDoc(doc), []);
});

test("statusOf summarizes progress, next task and pending decisions", () => {
  const s = statusOf(GOOD);
  assert.deepStrictEqual([s.done, s.total], [1, 2]);
  assert.strictEqual(s.next.id, "T2");
  assert.deepStrictEqual(s.needsDecision, []);
  const withDecision = statusOf(GOOD + "\n## Needs your decision\n- Which payment provider?\n");
  assert.deepStrictEqual(withDecision.needsDecision, ["Which payment provider?"]);
  const finished = statusOf(GOOD.replace("- [ ] T2", "- [x] T2").replace("commit: —", "commit: ffff111"));
  assert.strictEqual(finished.next, null);
});

function project(files) {
  const dir = tmp("sc-odd-");
  for (const [rel, text] of Object.entries(files)) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
  return dir;
}
const odd = (args, cwd) => spawnSync("node", [path.join(root, "scripts", "odd.js"), ...args], { cwd, encoding: "utf8" });

test("odd.js check exits 0 on a good file and 1 with the problems listed on a bad one", () => {
  const dir = project({ "odd/tasks/good.md": GOOD, "odd/tasks/bad.md": GOOD.replace("- L1 (2026-10-22)", "- note") });
  assert.strictEqual(odd(["check", "odd/tasks/good.md"], dir).status, 0);
  const bad = odd(["check", "odd/tasks/bad.md"], dir);
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stdout + bad.stderr, /L1/);
});

test("odd.js status finds the active feature document in odd/tasks", () => {
  const done = GOOD.replace("- [ ] T2", "- [x] T2").replace("commit: —", "commit: ffff111");
  const dir = project({ "odd/tasks/old-feature.md": done, "odd/tasks/reservations.md": GOOD });
  const r = odd(["status"], dir);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /reservations/);
  assert.match(r.stdout, /1\/2/);
  assert.match(r.stdout, /T2/);
  const none = odd(["status"], tmp("sc-odd-empty-"));
  assert.strictEqual(none.status, 0);
  assert.match(none.stdout, /no feature document/i);
});

const hook = (file, cwd) =>
  spawnSync("node", [path.join(root, "hooks", "scripts", "odd-lint.js")], { input: JSON.stringify({ tool_input: { file_path: file } }), cwd, encoding: "utf8" });

test("odd-lint hook flags a broken feature document and ignores everything else", () => {
  const dir = project({
    "odd/tasks/bad.md": GOOD.replace("- L1 (2026-10-22)", "- note"),
    "odd/tasks/good.md": GOOD,
    "notes/readme.md": "- [ ] not a feature doc",
  });
  const bad = hook(path.join(dir, "odd/tasks/bad.md"), dir);
  assert.strictEqual(bad.status, 2);
  assert.match(bad.stderr, /L1/);
  assert.strictEqual(hook(path.join(dir, "odd/tasks/good.md"), dir).status, 0);
  assert.strictEqual(hook(path.join(dir, "notes/readme.md"), dir).status, 0);
  assert.strictEqual(hook(path.join(dir, "odd/tasks/_template.md"), dir).status, 0, "the template is not linted");
});

test("session-start injects the active feature document summary, also after compaction", () => {
  const dir = project({ "docs/constitution.md": "# Rules\nSize first.", "odd/tasks/reservations.md": GOOD });
  const normal = spawnSync("node", [path.join(root, "hooks", "scripts", "session-start.js")], { cwd: dir, encoding: "utf8" });
  assert.match(normal.stdout, /odd\/tasks\/reservations\.md/);
  assert.match(normal.stdout, /1\/2/);
  const compact = spawnSync("node", [path.join(root, "hooks", "scripts", "session-start.js"), "--compact"], { cwd: dir, encoding: "utf8" });
  assert.match(compact.stdout, /T2/);
  assert.doesNotMatch(compact.stdout, /T1 \(S1\) Booking/);
});

test("the hooks file registers the odd-lint hook on file writes", () => {
  const h = fs.readFileSync(path.join(root, "hooks", "hooks.json"), "utf8");
  assert.match(h, /odd-lint\.js/);
});
