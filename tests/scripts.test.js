const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "vibe-test-"));

test("export-agents fails without AGENTS.md", () => {
  const r = spawnSync("node", [path.join(root, "scripts", "export-agents.js"), tmp()], { encoding: "utf8" });
  assert.strictEqual(r.status, 1);
});

test("export-agents writes Cursor/Gemini/Copilot files and keeps existing ones", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "# Rules\nTest first.");
  const exp = (...extra) =>
    spawnSync("node", [path.join(root, "scripts", "export-agents.js"), dir, ...extra], { encoding: "utf8" });

  assert.strictEqual(exp().status, 0);
  const mdc = fs.readFileSync(path.join(dir, ".cursor", "rules", "swiftcraft.mdc"), "utf8");
  assert.match(mdc, /alwaysApply: true/);
  assert.match(mdc, /Test first\./);
  assert.match(fs.readFileSync(path.join(dir, "GEMINI.md"), "utf8"), /@\.\/AGENTS\.md/);
  assert.ok(fs.existsSync(path.join(dir, ".github", "copilot-instructions.md")));

  fs.writeFileSync(path.join(dir, "GEMINI.md"), "custom");
  assert.match(exp().stdout, /skip\s+GEMINI\.md/);
  assert.strictEqual(fs.readFileSync(path.join(dir, "GEMINI.md"), "utf8"), "custom");
  exp("--force");
  assert.match(fs.readFileSync(path.join(dir, "GEMINI.md"), "utf8"), /AGENTS\.md/);
});

test("setup script reports the Node.js version first and exits 0 without --apply", () => {
  const r = spawnSync("node", [path.join(root, "scripts", "setup-engram.js")], { encoding: "utf8", timeout: 60000 });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout.split("\n")[0], /^OK\s+node \d+\.\d+\.\d+/);
});

test("plugin icon is a square PNG of at least 512 px", () => {
  const buf = fs.readFileSync(path.join(root, ".claude-plugin", "icon.png"));
  assert.strictEqual(buf.subarray(1, 4).toString(), "PNG");
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  assert.ok(w === h && w >= 512 && w <= 2048, `icon is ${w}x${h}`);
  assert.ok(buf.length < 2 * 1024 * 1024);
});

test("stack templates exist with the required sections", () => {
  for (const s of ["nextjs", "node-api", "python-fastapi"]) {
    const t = fs.readFileSync(path.join(root, "templates", "stacks", s, "STACK.md"), "utf8");
    assert.match(t, /## Rules/);
    assert.match(t, /## Commands/);
  }
});
