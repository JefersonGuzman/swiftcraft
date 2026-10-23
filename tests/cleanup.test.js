const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { tmp } = require("./helpers.js");

const root = path.join(__dirname, "..");
const { cleanup } = require("../scripts/lib/cleanup.js");
const run = (args, tmpRoot) =>
  spawnSync(process.execPath, [path.join(root, "scripts", "cleanup.js"), ...args], { encoding: "utf8", env: { ...process.env, SWIFTCRAFT_TMP_DIR: tmpRoot } });

const ago = (hours) => new Date(Date.now() - hours * 3600 * 1000);
function dir(parent, name, hours) {
  const p = path.join(parent, name);
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, "meta.json"), "{}");
  fs.utimesSync(p, ago(hours), ago(hours));
  return p;
}
function file(parent, name, hours) {
  const p = path.join(parent, name);
  fs.writeFileSync(p, "{}");
  fs.utimesSync(p, ago(hours), ago(hours));
  return p;
}

test("dry run is the default: it lists what it would delete and deletes nothing", () => {
  const t = tmp("sc-clean-");
  const old = dir(t, "swiftcraft-pr-12-aB3dE9", 48);
  const r = run([], t);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /dry run/i);
  assert.match(r.stdout, /would delete.*swiftcraft-pr-12-aB3dE9/);
  assert.ok(fs.existsSync(old));
});

test("--apply deletes old scratch folders only: recent, foreign and unrecognized entries stay", () => {
  const t = tmp("sc-clean-");
  const old = dir(t, "swiftcraft-pr-12-aB3dE9", 48);
  const recent = dir(t, "swiftcraft-pr-13-zZ9yX8", 2);
  const foreign = dir(t, "some-other-folder", 500);
  const lookalike = dir(t, "swiftcraft-pr-notanumber-aB3dE9", 500);
  const noSuffix = dir(t, "swiftcraft-pr-14", 500);
  const r = run(["--apply"], t);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(!fs.existsSync(old), "old folder deleted");
  for (const keep of [recent, foreign, lookalike, noSuffix]) assert.ok(fs.existsSync(keep), `${keep} must stay`);
  assert.match(r.stdout, /deleted.*swiftcraft-pr-12-aB3dE9/);
  assert.match(r.stdout, /1 deleted/);
});

test("session state files older than 7 days are removed, the update cache never is", () => {
  const t = tmp("sc-clean-");
  const oldState = file(t, "swiftcraft-abc123def.json", 24 * 8);
  const freshState = file(t, "swiftcraft-recentsession.json", 5);
  const cache = file(t, "swiftcraft-update-check.json", 24 * 30);
  const other = file(t, "unrelated.json", 24 * 30);
  const r = run(["--apply"], t);
  assert.strictEqual(r.status, 0);
  assert.ok(!fs.existsSync(oldState));
  for (const keep of [freshState, cache, other]) assert.ok(fs.existsSync(keep), `${keep} must stay`);
});

test("--older-than changes the age limit and rejects invalid values", () => {
  const t = tmp("sc-clean-");
  const twoHours = dir(t, "swiftcraft-pr-5-aaaaaa", 2);
  assert.strictEqual(run(["--apply"], t).status, 0);
  assert.ok(fs.existsSync(twoHours), "2 h old is kept by the default 24 h limit");
  assert.strictEqual(run(["--apply", "--older-than", "1"], t).status, 0);
  assert.ok(!fs.existsSync(twoHours), "2 h old is deleted with --older-than 1");
  for (const bad of ["abc", "0", "-5", ""]) {
    const r = run(["--older-than", bad], t);
    assert.strictEqual(r.status, 1, `--older-than "${bad}" must be rejected`);
    assert.match(r.stderr, /older-than/);
  }
});

test("--dir removes one named scratch folder regardless of age", () => {
  const t = tmp("sc-clean-");
  const target = dir(t, "swiftcraft-pr-21-qQ1wW2", 0.1);
  const sibling = dir(t, "swiftcraft-pr-22-eE3rR4", 0.1);
  const dry = run(["--dir", target], t);
  assert.strictEqual(dry.status, 0);
  assert.match(dry.stdout, /would delete/);
  assert.ok(fs.existsSync(target));
  const r = run(["--dir", target, "--apply"], t);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(!fs.existsSync(target));
  assert.ok(fs.existsSync(sibling), "other folders are untouched");
});

test("--dir refuses paths outside the temp folder, unrecognized names and missing paths", () => {
  const t = tmp("sc-clean-");
  const outsideParent = tmp("sc-clean-outside-");
  const outside = dir(outsideParent, "swiftcraft-pr-1-abcdef", 500);
  const wrongName = dir(t, "my-documents", 500);
  const traversal = path.join(t, "..", path.basename(outsideParent), "swiftcraft-pr-1-abcdef");
  for (const bad of [outside, wrongName, traversal, path.join(t, "swiftcraft-pr-9-nothere")]) {
    const r = run(["--dir", bad, "--apply"], t);
    assert.strictEqual(r.status, 1, `must refuse ${bad}`);
    assert.match(r.stderr, /refus|not a swiftcraft scratch folder|does not exist/i);
  }
  assert.ok(fs.existsSync(outside) && fs.existsSync(wrongName), "nothing was deleted");
});

test("a symlink or junction named like a scratch folder is never followed or deleted", (t) => {
  const tmpRoot = tmp("sc-clean-");
  const precious = dir(tmp("sc-clean-precious-"), "keep-me", 500);
  const link = path.join(tmpRoot, "swiftcraft-pr-30-lnk123");
  try {
    fs.symlinkSync(precious, link, "junction");
  } catch {
    t.skip("cannot create a symlink or junction on this machine");
    return;
  }
  fs.lutimesSync?.(link, ago(500), ago(500));
  const r = run(["--apply", "--older-than", "1"], tmpRoot);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(fs.existsSync(path.join(precious, "meta.json")), "the link target's content must survive");
});

test("an error while deleting is reported, does not stop the other deletions, and fails the exit code", () => {
  const t = tmp("sc-clean-");
  const a = dir(t, "swiftcraft-pr-40-aaaaaa", 48);
  const b = dir(t, "swiftcraft-pr-41-bbbbbb", 48);
  const result = cleanup({
    tmpRoot: t,
    apply: true,
    olderThanHours: 24,
    remove: (p) => {
      if (p.endsWith("aaaaaa")) throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      fs.rmSync(p, { recursive: true, force: true });
    },
  });
  assert.strictEqual(result.errors.length, 1);
  assert.match(result.errors[0].error, /EACCES/);
  assert.deepStrictEqual(result.deleted.map((d) => path.basename(d.path)), ["swiftcraft-pr-41-bbbbbb"]);
  assert.ok(fs.existsSync(a) && !fs.existsSync(b));
});

test("the CLI exits 1 and prints the error text when a deletion fails", () => {
  const t = tmp("sc-clean-");
  const r = run(["--dir", path.join(t, "swiftcraft-pr-9-nothere"), "--apply"], t);
  assert.strictEqual(r.status, 1);
  assert.ok(r.stderr.length > 0, "errors are never silent");
});

test("doctor points at the cleanup script and the pr-review skill uses it", () => {
  const doctor = fs.readFileSync(path.join(root, "scripts", "doctor.js"), "utf8");
  assert.match(doctor, /cleanup\.js/);
  const skill = fs.readFileSync(path.join(root, "skills", "pr-review", "SKILL.md"), "utf8");
  assert.match(skill, /cleanup\.js" --dir/);
  const post = fs.readFileSync(path.join(root, "scripts", "pr-post.js"), "utf8");
  assert.match(post, /cleanup\.js/);
});
