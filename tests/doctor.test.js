const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { tmp } = require("./helpers.js");

const root = path.join(__dirname, "..");
const doctor = (args = [], env = {}, opts = {}) =>
  spawnSync(process.execPath, [path.join(root, "scripts", "doctor.js"), ...args], { encoding: "utf8", env: { ...process.env, ...env }, ...opts });

const GOOD_DOC = `# Reservations
Objective: x

## Specs
- S1: "a"

## Tasks
- [ ] T1 (S1) Do it — route: inline · commit: — · done when: it passes

## Log
- L1 (2026-10-22) do it
`;

function project(files = {}) {
  const dir = tmp("sc-doctor-project-");
  for (const [rel, text] of Object.entries(files)) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
  return dir;
}
const snapshot = (dir) =>
  fs
    .readdirSync(dir, { recursive: true })
    .sort()
    .map((p) => `${p}:${fs.statSync(path.join(dir, p)).isFile() ? fs.readFileSync(path.join(dir, p), "utf8").length : "dir"}`);

test("a correct installation has no errors and exits 0 (optional tools may only warn)", () => {
  const proj = project({ "docs/constitution.md": "# Rules", "odd/tasks/reservations.md": GOOD_DOC });
  const r = doctor(["--project", proj], { SWIFTCRAFT_TMP_DIR: tmp("sc-doctor-tmp-") });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /^ERROR/m);
  assert.match(r.stdout, /^OK\s+Node\.js/m);
  assert.match(r.stdout, /^OK\s+Plugin manifest/m);
  assert.match(r.stdout, /^OK\s+Hooks configuration/m);
  assert.match(r.stdout, /^OK\s+Scripts parse/m);
  assert.match(r.stdout, /^OK\s+Hooks respond/m);
  assert.match(r.stdout, /0 error/);
});

test("an incomplete configuration is an ERROR with the cause and a fix, and exits 1", () => {
  const fake = tmp("sc-doctor-root-");
  fs.mkdirSync(path.join(fake, ".claude-plugin"));
  fs.mkdirSync(path.join(fake, "hooks"));
  fs.writeFileSync(path.join(fake, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "swiftcraft", version: "9.9.9" }));
  fs.writeFileSync(
    path.join(fake, "hooks", "hooks.json"),
    JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/missing-hook.js"' }] }] } })
  );
  const r = doctor(["--root", fake, "--project", project()], { SWIFTCRAFT_TMP_DIR: tmp("sc-doctor-tmp-") });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /^ERROR\s+Hooks configuration/m);
  assert.match(r.stdout, /missing-hook\.js/);
  assert.match(r.stdout, /Fix:/);
  assert.match(r.stdout, /1 error/);
});

test("a missing or invalid manifest and unparsable hooks.json are errors", () => {
  const empty = tmp("sc-doctor-root-");
  const r1 = doctor(["--root", empty, "--project", project()], { SWIFTCRAFT_TMP_DIR: tmp("sc-doctor-tmp-") });
  assert.strictEqual(r1.status, 1);
  assert.match(r1.stdout, /^ERROR\s+Plugin manifest/m);

  const broken = tmp("sc-doctor-root-");
  fs.mkdirSync(path.join(broken, ".claude-plugin"));
  fs.mkdirSync(path.join(broken, "hooks"));
  fs.writeFileSync(path.join(broken, ".claude-plugin", "plugin.json"), "{ not json");
  fs.writeFileSync(path.join(broken, "hooks", "hooks.json"), "{ not json");
  const r2 = doctor(["--root", broken, "--project", project()], { SWIFTCRAFT_TMP_DIR: tmp("sc-doctor-tmp-") });
  assert.strictEqual(r2.status, 1);
  assert.match(r2.stdout, /^ERROR\s+Plugin manifest/m);
  assert.match(r2.stdout, /^ERROR\s+Hooks configuration/m);
});

test("a script with a syntax error is reported", () => {
  const fake = tmp("sc-doctor-root-");
  fs.cpSync(root, fake, { recursive: true, filter: (src) => !/node_modules|[\\/]\.git([\\/]|$)/.test(src) });
  fs.writeFileSync(path.join(fake, "scripts", "export-agents.js"), "const = ;");
  const r = doctor(["--root", fake, "--project", project()], { SWIFTCRAFT_TMP_DIR: tmp("sc-doctor-tmp-") });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /^ERROR\s+Scripts parse/m);
  assert.match(r.stdout, /export-agents\.js/);
});

test("absent optional tools only warn and never make the exit code fail", () => {
  const nodeOnly = path.dirname(process.execPath);
  const r = doctor(["--project", project({ "docs/constitution.md": "# Rules" })], { PATH: nodeOnly, Path: nodeOnly, SWIFTCRAFT_TMP_DIR: tmp("sc-doctor-tmp-") });
  assert.strictEqual(r.status, 0, r.stdout);
  for (const tool of ["GitHub CLI", "Claude CLI", "Engram", "RTK"]) {
    assert.match(r.stdout, new RegExp(`^WARNING\\s+${tool}`, "m"), `${tool} should warn`);
  }
  assert.match(r.stdout, /optional/i);
  assert.doesNotMatch(r.stdout, /^ERROR/m);
});

test("project warnings: not initialized, broken feature documents, residual scratch folders", () => {
  const tmpDir = tmp("sc-doctor-tmp-");
  const old = path.join(tmpDir, "swiftcraft-pr-7-abc123");
  fs.mkdirSync(old);
  const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000);
  fs.utimesSync(old, twoDaysAgo, twoDaysAgo);
  const fresh = path.join(tmpDir, "swiftcraft-pr-8-def456");
  fs.mkdirSync(fresh);
  const proj = project({ "odd/tasks/broken.md": GOOD_DOC.replace("- L1 (2026-10-22)", "- note") });
  const r = doctor(["--project", proj], { SWIFTCRAFT_TMP_DIR: tmpDir });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /^WARNING\s+Project initialized/m);
  assert.match(r.stdout, /^WARNING\s+Feature documents/m);
  assert.match(r.stdout, /broken\.md/);
  assert.match(r.stdout, /^WARNING\s+Scratch folders/m);
  assert.match(r.stdout, /swiftcraft-pr-7-abc123/);
  assert.doesNotMatch(r.stdout, /swiftcraft-pr-8-def456/, "recent folders are not reported");
});

test("doctor is read-only: it creates, changes and deletes nothing", () => {
  const tmpDir = tmp("sc-doctor-tmp-");
  const old = path.join(tmpDir, "swiftcraft-pr-3-zzz999");
  fs.mkdirSync(old);
  const longAgo = new Date(Date.now() - 96 * 3600 * 1000);
  fs.utimesSync(old, longAgo, longAgo);
  const proj = project({ "docs/constitution.md": "# Rules", "odd/tasks/reservations.md": GOOD_DOC });
  const before = [snapshot(proj), snapshot(tmpDir)];
  doctor(["--project", proj], { SWIFTCRAFT_TMP_DIR: tmpDir });
  assert.deepStrictEqual([snapshot(proj), snapshot(tmpDir)], before);
  assert.ok(fs.existsSync(old), "the old scratch folder must still exist");
});

test("--json returns every check with its level and a summary", () => {
  const r = doctor(["--json", "--project", project({ "docs/constitution.md": "# Rules" })], { SWIFTCRAFT_TMP_DIR: tmp("sc-doctor-tmp-") });
  const j = JSON.parse(r.stdout);
  assert.ok(Array.isArray(j.checks) && j.checks.length >= 8);
  for (const c of j.checks) {
    assert.ok(["OK", "WARNING", "ERROR"].includes(c.level), `bad level ${c.level}`);
    assert.ok(c.title && c.detail !== undefined);
  }
  assert.deepStrictEqual(Object.keys(j.summary).sort(), ["errors", "ok", "warnings"]);
});

test("the doctor command and docs exist", () => {
  const cmd = fs.readFileSync(path.join(root, "commands", "doctor.md"), "utf8");
  assert.match(cmd, /doctor\.js/);
  assert.match(cmd, /read-only|does not (change|modify|delete)/i);
  assert.match(fs.readFileSync(path.join(root, "README.md"), "utf8"), /\/swiftcraft:doctor/);
});
