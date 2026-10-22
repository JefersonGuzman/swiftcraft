const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const script = (n) => path.join(root, "hooks", "scripts", n);
const run = (name, input, opts = {}) =>
  spawnSync("node", [script(name), ...(opts.args || [])], {
    input: input === undefined ? "" : JSON.stringify(input),
    encoding: "utf8",
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env || {}) },
  });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "vibe-test-"));

test("protect-files blocks .env and keys, allows .env.example", () => {
  assert.strictEqual(run("protect-files.js", { tool_input: { file_path: "C:/x/.env" } }).status, 2);
  assert.strictEqual(run("protect-files.js", { tool_input: { file_path: "/x/server.pem" } }).status, 2);
  assert.strictEqual(run("protect-files.js", { tool_input: { file_path: "/x/.env.example" } }).status, 0);
  assert.strictEqual(run("protect-files.js", { tool_input: { file_path: "/x/src/a.ts" } }).status, 0);
});

test("protect-files fails open on invalid input", () => {
  const r = spawnSync("node", [script("protect-files.js")], { input: "not json", encoding: "utf8" });
  assert.strictEqual(r.status, 0);
});

test("arch-lint flags framework/outer imports in domain, passes clean code", () => {
  const dir = tmp();
  const d = path.join(dir, "src", "orders", "domain");
  fs.mkdirSync(d, { recursive: true });
  const bad = path.join(d, "bad.ts");
  const good = path.join(d, "good.ts");
  fs.writeFileSync(bad, "import express from 'express'\nimport { R } from '../infrastructure/repo'\n");
  fs.writeFileSync(good, "import { Money } from './money'\nexport const a = 1\n");
  const r = run("arch-lint.js", { tool_input: { file_path: bad } });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /line 1/);
  assert.match(r.stderr, /line 2/);
  assert.strictEqual(run("arch-lint.js", { tool_input: { file_path: good } }).status, 0);
});

test("arch-lint ignores files outside domain/application and non-source files", () => {
  const dir = tmp();
  const f = path.join(dir, "src", "orders", "infrastructure", "repo.ts");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, "import express from 'express'\n");
  assert.strictEqual(run("arch-lint.js", { tool_input: { file_path: f } }).status, 0);
  const md = path.join(dir, "src", "orders", "domain", "notes.md");
  fs.mkdirSync(path.dirname(md), { recursive: true });
  fs.writeFileSync(md, "import express from 'express'\n");
  assert.strictEqual(run("arch-lint.js", { tool_input: { file_path: md } }).status, 0);
});

test("arch-lint honours docs/arch-rules.json overrides", () => {
  const dir = tmp();
  const d = path.join(dir, "src", "x", "domain");
  fs.mkdirSync(d, { recursive: true });
  fs.mkdirSync(path.join(dir, "docs"));
  fs.writeFileSync(path.join(dir, "docs", "arch-rules.json"), JSON.stringify({ domainForbidden: ["from\\s+'my-orm'"] }));
  const f = path.join(d, "e.ts");
  fs.writeFileSync(f, "import { db } from 'my-orm'\n");
  assert.strictEqual(run("arch-lint.js", { tool_input: { file_path: f } }, { cwd: dir }).status, 2);
});

test("session-start: silent rules without constitution, injects with one", () => {
  const empty = tmp();
  const r1 = run("session-start.js", undefined, { cwd: empty });
  assert.match(r1.stdout, /Memory:/);
  assert.doesNotMatch(r1.stdout, /constitution/);

  const proj = tmp();
  fs.mkdirSync(path.join(proj, "docs"));
  fs.writeFileSync(path.join(proj, "docs", "constitution.md"), "# Rules\nSpec before code.");
  fs.mkdirSync(path.join(proj, "specs", "001-login"), { recursive: true });
  const r2 = run("session-start.js", undefined, { cwd: proj });
  assert.match(r2.stdout, /Spec before code/);
  assert.match(r2.stdout, /specs\/001-login/);
});

test("session-start --compact restores open tasks only", () => {
  const proj = tmp();
  const s = path.join(proj, "specs", "002-cart");
  fs.mkdirSync(s, { recursive: true });
  fs.writeFileSync(path.join(s, "tasks.md"), "- [x] T1 done\n- [ ] T2 add item\n");
  const r = run("session-start.js", undefined, { cwd: proj, args: ["--compact"] });
  assert.match(r.stdout, /T2 add item/);
  assert.doesNotMatch(r.stdout, /T1 done/);
});

test("memory nudge: blocks once after enough edits, not twice, resets after save", () => {
  const sid = `t${Date.now()}`;
  const edit = { session_id: sid, tool_name: "Edit" };
  for (let i = 0; i < 3; i++) run("memory-track.js", edit);

  const first = run("memory-nudge.js", { session_id: sid });
  assert.strictEqual(first.status, 0);
  assert.strictEqual(JSON.parse(first.stdout).decision, "block");

  const second = run("memory-nudge.js", { session_id: sid });
  assert.strictEqual(second.stdout, "");

  run("memory-track.js", { session_id: sid, tool_name: "mcp__engram__mem_save" });
  for (let i = 0; i < 3; i++) run("memory-track.js", edit);
  assert.strictEqual(JSON.parse(run("memory-nudge.js", { session_id: sid }).stdout).decision, "block");
});

test("memory nudge: writing fallback memory files counts as a save", () => {
  const sid = `w${Date.now()}`;
  for (let i = 0; i < 4; i++) run("memory-track.js", { session_id: sid, tool_name: "Write", tool_input: { file_path: "/p/src/a.ts" } });
  run("memory-track.js", { session_id: sid, tool_name: "Write", tool_input: { file_path: "C:\\Users\\u\\.claude\\projects\\x\\memory\\note.md" } });
  assert.strictEqual(run("memory-nudge.js", { session_id: sid }).stdout, "");

  const sid2 = `x${Date.now()}`;
  for (let i = 0; i < 4; i++) run("memory-track.js", { session_id: sid2, tool_name: "Edit", tool_input: { file_path: "/p/a.ts" } });
  run("memory-track.js", { session_id: sid2, tool_name: "Write", tool_input: { file_path: "/p/docs/memory/INDEX.md" } });
  assert.strictEqual(run("memory-nudge.js", { session_id: sid2 }).stdout, "");
});

test("memory nudge: respects stop_hook_active, threshold and opt-out", () => {
  const sid = `u${Date.now()}`;
  for (let i = 0; i < 5; i++) run("memory-track.js", { session_id: sid, tool_name: "Write" });
  assert.strictEqual(run("memory-nudge.js", { session_id: sid, stop_hook_active: true }).stdout, "");
  assert.strictEqual(run("memory-nudge.js", { session_id: sid }, { env: { SWIFTCRAFT_NO_NUDGE: "1" } }).stdout, "");

  const few = `v${Date.now()}`;
  run("memory-track.js", { session_id: few, tool_name: "Edit" });
  assert.strictEqual(run("memory-nudge.js", { session_id: few }).stdout, "");
});

test("manifests are valid JSON and versions are in sync", () => {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
  const versions = [read("package.json"), read(".claude-plugin/plugin.json"), read(".codex-plugin/plugin.json")].map((j) => j.version);
  assert.strictEqual(new Set(versions).size, 1, `versions differ: ${versions}`);
  JSON.parse(fs.readFileSync(path.join(root, "hooks", "hooks.json"), "utf8"));
  JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin", "marketplace.json"), "utf8"));
});

test("every skill has frontmatter with name matching its folder and a description", () => {
  const dir = path.join(root, "skills");
  for (const name of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, name, "SKILL.md"), "utf8");
    const fm = text.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(fm, `${name}: no frontmatter`);
    assert.match(fm[1], new RegExp(`^name: ${name}$`, "m"), `${name}: name mismatch`);
    assert.match(fm[1], /^description: .{20,}/m, `${name}: weak description`);
  }
});
