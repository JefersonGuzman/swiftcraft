const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { tmp } = require("./helpers.js");

const root = path.join(__dirname, "..");
const { loadConfig, DEFAULTS } = require("../scripts/lib/config.js");

const project = (cfg) => {
  const dir = tmp("sc-config-");
  if (cfg !== undefined) fs.writeFileSync(path.join(dir, "swiftcraft.config.json"), typeof cfg === "string" ? cfg : JSON.stringify(cfg));
  return dir;
};
const NOENV = {};

test("without a file the defaults apply and every source says so", () => {
  const c = loadConfig(project(), NOENV);
  assert.deepStrictEqual(c.errors, []);
  assert.strictEqual(c.file, null);
  assert.deepStrictEqual(c.values, DEFAULTS);
  assert.strictEqual(c.sources["memory.nudge"], "default");
  assert.deepStrictEqual(DEFAULTS, { memory: { nudge: true, nudgeEdits: 3 }, review: { reminder: true }, updates: { check: true }, delivery: { advisoryLines: 400 } });
});

test("precedence is default < project file < environment", () => {
  const dir = project({ version: 1, memory: { nudgeEdits: 7 }, delivery: { advisoryLines: 250 }, review: { reminder: false } });
  const c = loadConfig(dir, { SWIFTCRAFT_NUDGE_EDITS: "9", SWIFTCRAFT_NO_UPDATE_CHECK: "1" });
  assert.strictEqual(c.values.memory.nudgeEdits, 9);
  assert.strictEqual(c.sources["memory.nudgeEdits"], "env");
  assert.strictEqual(c.values.delivery.advisoryLines, 250);
  assert.strictEqual(c.sources["delivery.advisoryLines"], "project");
  assert.strictEqual(c.values.review.reminder, false);
  assert.strictEqual(c.values.updates.check, false);
  assert.strictEqual(c.sources["updates.check"], "env");
  assert.strictEqual(c.values.memory.nudge, true);
  assert.strictEqual(c.sources["memory.nudge"], "default");
  assert.strictEqual(loadConfig(dir, { SWIFTCRAFT_NO_NUDGE: "1", SWIFTCRAFT_NO_REVIEW_REMINDER: "1" }).values.memory.nudge, false);
});

test("the file is found from a subfolder and nested folders do not leave the repository", () => {
  const dir = project({ delivery: { advisoryLines: 300 } });
  const sub = path.join(dir, "src", "deep");
  fs.mkdirSync(sub, { recursive: true });
  assert.strictEqual(loadConfig(sub, NOENV).values.delivery.advisoryLines, 300);
});

test("invalid files give actionable errors and the project file is ignored as a whole", () => {
  const cases = [
    ["{ not json", /not valid JSON/i],
    [[1, 2], /must be a JSON object/i],
    [{ memroy: {} }, /Unknown setting "memroy".*Did you mean "memory"/],
    [{ memory: { nudgeEdits: "abc" } }, /memory\.nudgeEdits must be a whole number from 1 to 100/],
    [{ memory: { nudgeEdits: 0 } }, /memory\.nudgeEdits/],
    [{ memory: { nudge: "yes" } }, /memory\.nudge must be true or false/],
    [{ delivery: { advisoryLines: 10 } }, /delivery\.advisoryLines must be a whole number from 50 to 5000/],
    [{ version: 2 }, /version must be 1/],
    [{ memory: { colour: 1 } }, /Unknown setting "memory\.colour"/],
    [{ memory: 3 }, /memory must be an object/],
  ];
  for (const [cfg, re] of cases) {
    const c = loadConfig(project(cfg), NOENV);
    assert.ok(c.errors.some((e) => re.test(e)), `${JSON.stringify(cfg)} -> ${JSON.stringify(c.errors)}`);
    assert.deepStrictEqual(c.values, DEFAULTS, "an invalid file never half-applies");
  }
});

test("mandatory controls cannot be configured, and the error says where their rules live", () => {
  for (const key of ["guard", "protectFiles", "commandGuard", "protect-files"]) {
    const c = loadConfig(project({ [key]: { enabled: false } }), NOENV);
    assert.ok(c.errors.some((e) => new RegExp(`${key}.*mandatory`, "i").test(e)), `${key}: ${JSON.stringify(c.errors)}`);
  }
  const c = loadConfig(project({ guard: false }), NOENV);
  assert.ok(c.errors.some((e) => /docs\/guard-rules\.json/.test(e)));
  assert.strictEqual(loadConfig(project({ guard: false }), { SWIFTCRAFT_NO_NUDGE: "1" }).values.memory.nudge, false, "env still applies when the file is rejected");
});

test("the file must not carry secrets and the error never repeats the value", () => {
  const token = "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
  const c = loadConfig(project({ memory: { nudge: token } }), NOENV);
  assert.ok(c.errors.some((e) => /secret|credential/i.test(e)));
  assert.ok(!JSON.stringify(c).includes(token));
  const k = loadConfig(project({ apiToken: "x" }), NOENV);
  assert.ok(k.errors.some((e) => /secret|credential/i.test(e)));
});

test("config CLI shows the effective values with their sources and exits 1 on errors", () => {
  const run = (dir, ...a) => spawnSync(process.execPath, [path.join(root, "scripts", "config.js"), ...a], { cwd: dir, encoding: "utf8", env: { ...process.env, SWIFTCRAFT_NO_NUDGE: "", SWIFTCRAFT_NUDGE_EDITS: "", SWIFTCRAFT_NO_REVIEW_REMINDER: "", SWIFTCRAFT_NO_UPDATE_CHECK: "" } });
  const ok = run(project({ delivery: { advisoryLines: 300 } }), "show");
  assert.strictEqual(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /delivery\.advisoryLines\s+300\s+\(project\)/);
  assert.match(ok.stdout, /memory\.nudge\s+true\s+\(default\)/);
  const json = JSON.parse(run(project(), "show", "--json").stdout);
  assert.deepStrictEqual(json.values, DEFAULTS);
  const bad = run(project({ memroy: 1 }), "show");
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stdout + bad.stderr, /Unknown setting "memroy"/);
});

test("hooks honour the project file and fall back safely when it is invalid", () => {
  const state = tmp("sc-config-state-");
  const env = { ...process.env, SWIFTCRAFT_STATE_DIR: state, SWIFTCRAFT_NO_NUDGE: "", SWIFTCRAFT_NUDGE_EDITS: "", SWIFTCRAFT_NO_REVIEW_REMINDER: "" };
  const stop = (dir, sid) => spawnSync(process.execPath, [path.join(root, "hooks", "scripts", "memory-nudge.js")], { input: JSON.stringify({ session_id: sid, cwd: dir }), encoding: "utf8", env });
  const seed = (sid, edits) => fs.writeFileSync(path.join(state, `swiftcraft-${sid}.json`), JSON.stringify({ edits, nudgedAt: 0 }));

  seed("a", 3);
  assert.match(stop(project(), "a").stdout, /memory/, "default threshold 3");
  seed("b", 3);
  assert.strictEqual(stop(project({ memory: { nudge: false } }), "b").stdout.trim(), "", "project can turn the nudge off");
  seed("c", 3);
  assert.strictEqual(stop(project({ memory: { nudgeEdits: 10 } }), "c").stdout.trim(), "", "project raises the threshold");
  seed("d", 3);
  assert.match(stop(project({ memroy: 1 }), "d").stdout, /memory/, "invalid file: defaults, never silent");
});

test("doctor reports the project configuration", () => {
  const run = (dir) => JSON.parse(spawnSync(process.execPath, [path.join(root, "scripts", "doctor.js"), "--json", "--project", dir], { encoding: "utf8" }).stdout);
  const find = (j) => j.checks.find((c) => c.title === "Project configuration");
  const ok = find(run(project({ delivery: { advisoryLines: 300 } })));
  assert.strictEqual(ok.level, "OK");
  assert.strictEqual(find(run(project())).level, "OK");
  const bad = find(run(project({ memroy: 1 })));
  assert.strictEqual(bad.level, "WARNING");
  assert.match(bad.detail + bad.fix, /Unknown setting/);
});

test("the README documents the file, the settings and what cannot be configured", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  for (const part of ["swiftcraft.config.json", "memory.nudgeEdits", "delivery.advisoryLines", "review.reminder", "updates.check", "mandatory"]) assert.match(readme, new RegExp(part.replace(".", "\\.")), `README misses ${part}`);
});
