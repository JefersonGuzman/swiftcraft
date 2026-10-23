const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { tmp } = require("./helpers.js");

const root = path.join(__dirname, "..");
const { assess } = require("../scripts/lib/risk.js");
const { checkMessage } = require("../scripts/lib/delivery.js");
const cli = (args, cwd) => spawnSync(process.execPath, [path.join(root, "scripts", "delivery.js"), ...args], { cwd, encoding: "utf8" });

const sh = (dir, ...args) => spawnSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8" });
const write = (dir, rel, text) => {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
const lines = (n, prefix = "line") => Array.from({ length: n }, (_, i) => `${prefix} ${i}`).join("\n") + "\n";

function repo({ scripts = { test: 'node -e "process.exit(0)"' } } = {}) {
  const dir = tmp("sc-delivery-");
  sh(dir, "init", "-q", "-b", "main");
  write(dir, "package.json", JSON.stringify({ name: "demo", scripts }));
  write(dir, "package-lock.json", lines(5, "lock"));
  write(dir, "src/orders/order.js", "exports.a = 1;\n");
  write(dir, "tests/order.test.js", "// test\n");
  write(dir, "README.md", "# demo\n");
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "chore: init");
  return dir;
}
const plan = (dir) => JSON.parse(cli(["plan", "--json"], dir).stdout);

// --- risk -------------------------------------------------------------------------------------------------------
test("risk: docs only is low, code with tests is medium, code without tests flags item 6, sensitive paths are high", () => {
  const f = (p, added = 5, removed = 0) => ({ path: p, added, removed });
  assert.strictEqual(assess([f("README.md"), f("docs/guide.md")]).tier, "low");
  const withTests = assess([f("src/orders/order.js"), f("tests/order.test.js")]);
  assert.strictEqual(withTests.tier, "medium");
  assert.strictEqual(withTests.items.length, 0);
  const noTests = assess([f("src/orders/order.js")]);
  assert.strictEqual(noTests.tier, "medium");
  assert.deepStrictEqual(noTests.items.map((i) => i.n), [6]);
  for (const [p, n] of [["migrations/001_add_users.sql", 1], ["src/auth/login.js", 2], [".github/workflows/ci.yml", 5], ["package.json", 5], ["package-lock.json", 5], ["Dockerfile", 5], ["openapi.yaml", 3], ["src/security/guard.js", 2], [".env.production", 2]]) {
    const a = assess([f(p), f("tests/x.test.js")]);
    assert.strictEqual(a.tier, "high", `${p} should be high risk`);
    assert.ok(a.items.some((i) => i.n === n), `${p} should name item ${n}: ${JSON.stringify(a.items)}`);
  }
  assert.deepStrictEqual(assess([f("src/a.js"), f("tests/a.test.js")]), assess([f("src/a.js"), f("tests/a.test.js")]), "deterministic");
});

// --- plan -------------------------------------------------------------------------------------------------------
test("plan: groups files into reviewable units, pairs tests with their code, excludes generated files from the line count", () => {
  const dir = repo();
  write(dir, "src/orders/order.js", "exports.a = 1;\n" + lines(20));
  write(dir, "tests/order.test.js", "// test\n" + lines(10));
  write(dir, "README.md", "# demo\n\nNew docs.\n");
  write(dir, "package-lock.json", lines(500, "lock"));
  const p = plan(dir);
  assert.ok(p.units.length >= 2);
  const code = p.units.find((u) => u.files.includes("src/orders/order.js"));
  assert.ok(code.files.includes("tests/order.test.js"), "the test travels with the code it covers");
  assert.strictEqual(code.authoredLines, 30);
  assert.ok(p.units.some((u) => u.files.includes("README.md")));
  assert.ok(p.generated.includes("package-lock.json"));
  assert.strictEqual(p.totalAuthoredLines < 100, true, "the 500-line lockfile is not authored code");
  assert.ok(p.units.every((u) => /^(feat|fix|docs|test|chore|ci|build|refactor)$/.test(u.suggestedType)));
});

test("plan: about 400 lines is advisory, never a cap or a forced split", () => {
  const dir = repo();
  write(dir, "src/orders/big.js", lines(500));
  const r = cli(["plan"], dir);
  const p = plan(dir);
  assert.strictEqual(p.over400, true);
  assert.match(r.stdout, /advisory/i);
  assert.doesNotMatch(r.stdout, /must split|exceeds the limit|too large to commit/i);
  assert.strictEqual(r.status, 0);
});

test("plan: sensitive areas get their own commit recommendation with the risk items named", () => {
  const dir = repo();
  write(dir, ".github/workflows/ci.yml", "name: ci\n");
  write(dir, "migrations/001.sql", "create table t(id int);\n");
  write(dir, "src/auth/login.js", "exports.login = 1;\n");
  const p = plan(dir);
  const risky = p.units.filter((u) => u.risk.tier === "high");
  assert.ok(risky.length >= 1);
  assert.ok(p.highRiskFiles.some((f) => /ci\.yml/.test(f)) && p.highRiskFiles.some((f) => /001\.sql/.test(f)) && p.highRiskFiles.some((f) => /login\.js/.test(f)));
  const text = cli(["plan"], dir).stdout;
  assert.match(text, /own commit/i);
  assert.match(text, /\/swiftcraft:review/);
});

test("plan: a possible secret is reported without ever printing it", () => {
  const dir = repo();
  const token = "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
  write(dir, "src/orders/config.js", `exports.token = "${token}";\n`);
  const r = cli(["plan"], dir);
  assert.match(r.stdout, /possible secret/i);
  assert.match(r.stdout, /src\/orders\/config\.js/);
  assert.ok(!r.stdout.includes(token) && !r.stderr.includes(token) && !cli(["plan", "--json"], dir).stdout.includes(token));
});

test("plan: branch rules, suggested name, and an active feature document", () => {
  const dir = repo();
  write(dir, "src/orders/order.js", lines(3));
  const onMain = plan(dir);
  assert.strictEqual(onMain.branch.name, "main");
  assert.strictEqual(onMain.branch.onDefault, true);
  assert.match(onMain.branch.suggested, /^(feat|fix|docs|chore)\/[a-z0-9][a-z0-9-]*$/);
  assert.match(cli(["plan"], dir).stdout, /branch first|create a branch/i);

  sh(dir, "switch", "-q", "-c", "my-branch");
  assert.ok(plan(dir).branch.problems.some((x) => /feat|fix|docs|chore/.test(x)));
  sh(dir, "switch", "-q", "-c", "feat/orders");
  const ok = plan(dir);
  assert.strictEqual(ok.branch.onDefault, false);
  assert.deepStrictEqual(ok.branch.problems, []);

  write(dir, "odd/tasks/orders.md", '# Orders\nObjective: x\n\n## Specs\n- S1: "a"\n\n## Tasks\n- [ ] T1 (S1) Do it — route: inline · commit: — · done when: ok\n\n## Log\n- L1 (2026-10-22) a\n');
  const withDoc = plan(dir);
  assert.strictEqual(withDoc.feature.file, "odd/tasks/orders.md");
  assert.strictEqual(withDoc.feature.state, "working");
  assert.match(cli(["plan"], dir).stdout, /T1/);
});

test("plan: a clean tree says there is nothing to commit", () => {
  const dir = repo();
  const r = cli(["plan"], dir);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /nothing to commit/i);
  assert.deepStrictEqual(plan(dir).units, []);
});

test("plan: outside a git repository it explains instead of crashing", () => {
  const r = cli(["plan"], tmp("sc-delivery-nogit-"));
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /not a git repository/i);
});

// --- commit messages ----------------------------------------------------------------------------------------------
test("checkMessage enforces Conventional Commits and forbids AI attribution", () => {
  assert.deepStrictEqual(checkMessage("feat(orders): add booking"), []);
  assert.deepStrictEqual(checkMessage("fix: handle empty cart\n\nThe cart could be empty.\n\nRisk: none"), []);
  assert.deepStrictEqual(checkMessage("feat(api)!: drop the v1 endpoint"), []);
  const bad = (m) => checkMessage(m).join(" | ");
  assert.match(bad("added stuff"), /Conventional/i);
  assert.match(bad("feat: add booking."), /period/i);
  assert.match(bad("feat: " + "x".repeat(80)), /72/);
  assert.match(bad("feat: a\n\nCo-Authored-By: Claude <noreply@anthropic.com>"), /attribution/i);
  assert.match(bad("feat: a\n\nGenerated with Claude Code"), /attribution/i);
  assert.match(bad("feat: a\n\nCo-authored-by: Someone"), /attribution/i);
  assert.match(bad(""), /empty/i);
});

test("check-message CLI exits 1 with the problems and 0 when fine", () => {
  const dir = repo();
  assert.strictEqual(cli(["check-message", "feat(x): ok"], dir).status, 0);
  const r = cli(["check-message", "WIP"], dir);
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout + r.stderr, /Conventional/i);
});

// --- validate -------------------------------------------------------------------------------------------------------
test("validate runs the project's own commands and reports each result honestly", () => {
  const dir = repo({ scripts: { test: 'node -e "process.exit(0)"', lint: 'node -e "process.exit(0)"' } });
  const out = path.join(tmp("sc-delivery-out-"), "validation.json");
  const r = cli(["validate", "--out", out], dir);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /PASS.*npm test/);
  assert.match(r.stdout, /PASS.*npm run lint/);
  const j = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.strictEqual(j.validated, true);
  assert.deepStrictEqual(j.results.map((x) => x.ok), [true, true]);

  const bad = repo({ scripts: { test: 'node -e "console.error(\'boom\'); process.exit(3)"' } });
  const rb = cli(["validate"], bad);
  assert.strictEqual(rb.status, 1);
  assert.match(rb.stdout, /FAIL.*npm test.*exit 3/);
  assert.match(rb.stdout, /boom/);
});

test("validate never pretends: with no commands found it says nothing was validated", () => {
  const dir = tmp("sc-delivery-empty-");
  sh(dir, "init", "-q", "-b", "main");
  const out = path.join(tmp("sc-delivery-out-"), "v.json");
  const r = cli(["validate", "--out", out], dir);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /nothing was validated/i);
  assert.strictEqual(JSON.parse(fs.readFileSync(out, "utf8")).validated, false);
});

// --- pr-body ---------------------------------------------------------------------------------------------------------
function branchWithCommits() {
  const dir = repo();
  sh(dir, "switch", "-q", "-c", "feat/orders");
  write(dir, "src/orders/order.js", "exports.a = 2;\n");
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "feat(orders): add booking\n\nRisk: none");
  const hash = sh(dir, "rev-parse", "--short", "HEAD").stdout.trim();
  write(dir, "README.md", "# demo\n\nBooking.\n");
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "docs: describe booking");
  write(dir, "odd/tasks/orders.md", `# Orders\nObjective: x\n\n## Specs\n- S1: "Guests can book"\n\n## Tasks\n- [x] T1 (S1) Booking — route: inline · commit: ${hash} · done when: ok\n\n## Log\n- L1 (2026-10-22) Guests can book\n`);
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "docs: add the feature document");
  return { dir, hash };
}

test("pr-body: describes the change, traces tasks to commits, shows real test results and risk lines", () => {
  const { dir, hash } = branchWithCommits();
  const v = path.join(tmp("sc-delivery-out-"), "v.json");
  fs.writeFileSync(v, JSON.stringify({ validated: true, results: [{ command: "npm test", ok: true, exitCode: 0, tail: "ok" }, { command: "npm run lint", ok: false, exitCode: 1, tail: "2 problems" }] }));
  const r = cli(["pr-body", "--base", "main", "--validated", v], dir);
  assert.strictEqual(r.status, 0, r.stderr);
  const body = r.stdout;
  for (const h of ["## What and why", "## Traceability", "## Tests run", "## Risk", "## Checklist"]) assert.ok(body.includes(h), `missing ${h}`);
  assert.match(body, /feat\(orders\): add booking/);
  assert.match(body, /Branch: `feat\/orders`/);
  assert.match(body, new RegExp(`T1.*${hash}`));
  assert.match(body, /PASS.*npm test/);
  assert.match(body, /FAIL.*npm run lint.*exit 1/, "failures are never hidden");
  assert.match(body, /Risk: none/);
  assert.doesNotMatch(body, /Co-Authored-By|Generated with|Claude/i);
});

test("pr-body: without validation results it says so, and it uses the repository's PR template checklist", () => {
  const { dir } = branchWithCommits();
  write(dir, ".github/pull_request_template.md", "## Checklist\n- [ ] custom item one\n- [ ] custom item two\n");
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "chore: add pr template");
  const body = cli(["pr-body", "--base", "main"], dir).stdout;
  assert.match(body, /Not verified|not validated/i);
  assert.match(body, /custom item one/);
});

test("pr-body: a base that does not exist is an error, not an empty PR", () => {
  const { dir } = branchWithCommits();
  const r = cli(["pr-body", "--base", "nope"], dir);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /base/i);
});

// --- safety ------------------------------------------------------------------------------------------------------------
test("the delivery scripts only read the repository: no push, commit, add, reset, rebase, merge, checkout or gh calls", () => {
  const allowed = new Set(["status", "diff", "log", "rev-parse", "ls-files", "show-ref", "symbolic-ref", "branch", "merge-base", "rev-list", "config"]);
  for (const f of ["scripts/delivery.js", "scripts/lib/delivery.js", "scripts/lib/risk.js"]) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    for (const m of src.matchAll(/git\(\s*\[\s*"([\w-]+)"/g)) assert.ok(allowed.has(m[1]), `${f}: git ${m[1]} is not a read-only command`);
    assert.doesNotMatch(src, /"(push|commit|add|reset|rebase|merge|checkout|switch|stash|cherry-pick|tag)"/, `${f} must not call mutating git commands`);
    assert.doesNotMatch(src, /--force|\bgh\b.*\b(pr|release)\b.*\b(create|merge)\b/, `${f} must not publish`);
  }
});

test("the delivery skill and commands require confirmation before anything remote and mention the rules", () => {
  const skill = fs.readFileSync(path.join(root, "skills", "delivery", "SKILL.md"), "utf8");
  assert.match(skill, /^name: delivery$/m);
  for (const part of ["confirm", "push", "never force", "Conventional", "Co-Authored-By", "own commit", "advisory", "Risk"]) assert.match(skill, new RegExp(part, "i"), `skill misses ${part}`);
  for (const c of ["commit", "pr"]) {
    const text = fs.readFileSync(path.join(root, "commands", `${c}.md`), "utf8");
    assert.match(text, /delivery\.js/);
    assert.match(text, /confirm/i);
  }
  assert.match(fs.readFileSync(path.join(root, "README.md"), "utf8"), /\/swiftcraft:commit/);
  assert.match(fs.readFileSync(path.join(root, "README.md"), "utf8"), /\/swiftcraft:pr/);
});
