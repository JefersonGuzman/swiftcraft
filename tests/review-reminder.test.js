const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { tmp } = require("./helpers.js");

const root = path.join(__dirname, "..");
const run = (script, input, env = {}) =>
  spawnSync(process.execPath, [path.join(root, "hooks", "scripts", script)], { input: JSON.stringify(input), encoding: "utf8", env: { ...process.env, ...env } });

const sh = (dir, ...args) => spawnSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8" });
const write = (dir, rel, text) => {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};

function setup({ edited = true } = {}) {
  const dir = tmp("sc-rr-");
  const state = tmp("sc-rr-state-");
  sh(dir, "init", "-q", "-b", "main");
  write(dir, "src/app.js", "exports.a = 1;\n");
  write(dir, "tests/app.test.js", "// t\n");
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "chore: init");
  const env = { SWIFTCRAFT_STATE_DIR: state };
  const stop = (extra = {}) => run("review-reminder.js", { session_id: "s1", cwd: dir, hook_event_name: "Stop", ...extra }, env);
  const track = (tool_name, tool_input, extra = {}) => run("review-track.js", { session_id: "s1", cwd: dir, hook_event_name: "PostToolUse", tool_name, tool_input, ...extra }, env);
  // A Write by the main agent, as the memory-track hook sees it: the reminder only applies to sessions that edited files.
  if (edited) run("memory-track.js", { session_id: "s1", cwd: dir, hook_event_name: "PostToolUse", tool_name: "Write", tool_input: { file_path: path.join(dir, "src", "app.js") } }, env);
  return { dir, state, env, stop, track };
}

test("a session that edited nothing is never nagged about a diff that was already there", () => {
  const { dir, stop } = setup({ edited: false });
  write(dir, "src/auth/login.js", "exports.login = 1;\n");
  assert.strictEqual(stop().stdout.trim(), "", "read-only session: silent");
  const edited = setup();
  write(edited.dir, "src/auth/login.js", "exports.login = 1;\n");
  assert.match(edited.stop().stdout, /\/swiftcraft:review/, "after an edit in the session it reminds");
});

test("no sensitive change: no reminder", () => {
  const { dir, stop } = setup();
  write(dir, "src/app.js", "exports.a = 2;\n");
  write(dir, "README.md", "# docs\n");
  const r = stop();
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout.trim(), "");
});

test("sensitive change without a review: reminds once per diff, again after the diff changes", () => {
  const { dir, stop } = setup();
  write(dir, "src/auth/login.js", "exports.login = 1;\n");
  const first = stop();
  assert.strictEqual(first.status, 0);
  const out = JSON.parse(first.stdout);
  assert.strictEqual(out.decision, "block");
  assert.match(out.reason, /\/swiftcraft:review/);
  assert.match(out.reason, /src\/auth\/login\.js/);
  assert.match(out.reason, /item 2/);
  assert.strictEqual(stop().stdout.trim(), "", "same diff: only once");
  write(dir, "src/auth/login.js", "exports.login = 2;\n");
  assert.match(stop().stdout, /\/swiftcraft:review/, "a new diff reminds again");
});

test("a review of the current diff silences the reminder, a later edit does not stay covered", () => {
  const { dir, stop, track } = setup();
  write(dir, "migrations/001.sql", "create table t(id int);\n");
  assert.strictEqual(track("Agent", { subagent_type: "swiftcraft:reviewer", prompt: "review" }).status, 0);
  assert.strictEqual(stop().stdout.trim(), "");
  write(dir, "migrations/001.sql", "create table t(id int, name text);\n");
  assert.match(stop().stdout, /\/swiftcraft:review/);
});

test("the review skill and the pr reviewer count as evidence; unrelated tools and subagent calls do not", () => {
  for (const [tool, input, extra, silent] of [
    ["Skill", { skill: "swiftcraft:review" }, {}, true],
    ["Skill", { skill: "swiftcraft:review-gate" }, {}, true],
    ["Agent", { subagent_type: "swiftcraft:explorer" }, {}, false],
    ["Skill", { skill: "swiftcraft:odd" }, {}, false],
    ["Agent", { subagent_type: "swiftcraft:reviewer" }, { agent_id: "sub1" }, false],
  ]) {
    const { dir, stop, track } = setup();
    write(dir, ".github/workflows/ci.yml", "name: ci\n");
    track(tool, input, extra);
    assert.strictEqual(stop().stdout.trim() === "", silent, `${tool} ${JSON.stringify(input)}`);
  }
});

test("it stays quiet when it should: stop_hook_active, opt-out, not a repository, nothing changed", () => {
  const { dir, stop, env } = setup();
  write(dir, "src/auth/login.js", "x\n");
  assert.strictEqual(stop({ stop_hook_active: true }).stdout.trim(), "");
  assert.strictEqual(run("review-reminder.js", { session_id: "s1", cwd: dir }, { ...env, SWIFTCRAFT_NO_REVIEW_REMINDER: "1" }).stdout.trim(), "");
  assert.strictEqual(run("review-reminder.js", { session_id: "s1", cwd: tmp("sc-rr-nogit-") }, env).stdout.trim(), "");
  const clean = setup();
  assert.strictEqual(clean.stop().stdout.trim(), "");
});

test("broken input never breaks the session", () => {
  for (const script of ["review-reminder.js", "review-track.js"]) {
    const r = spawnSync(process.execPath, [path.join(root, "hooks", "scripts", script)], { input: "not json", encoding: "utf8" });
    assert.strictEqual(r.status, 0);
  }
});

test("hooks.json registers the tracker after Agent and Skill calls and the reminder on Stop", () => {
  const h = JSON.parse(fs.readFileSync(path.join(root, "hooks", "hooks.json"), "utf8")).hooks;
  const track = h.PostToolUse.find((e) => e.hooks.some((x) => /review-track\.js/.test(x.command)));
  assert.ok(track && /Agent/.test(track.matcher) && /Skill/.test(track.matcher));
  assert.ok(h.Stop.some((e) => e.hooks.some((x) => /review-reminder\.js/.test(x.command))));
});
