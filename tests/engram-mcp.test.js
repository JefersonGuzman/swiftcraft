const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { tmp } = require("./helpers.js");

const root = path.join(__dirname, "..");
const { mcpRegistered, register, REGISTER_ARGS, claudeRunner } = require("../scripts/lib/engram-mcp.js");

test("registering uses the user scope and the engram mcp command", () => {
  assert.deepStrictEqual(REGISTER_ARGS, ["mcp", "add", "--scope", "user", "engram", "--", "engram", "mcp"]);
});

test("mcpRegistered is true only when `claude mcp get engram` succeeds; register runs the add command", () => {
  const calls = [];
  const fake = (status) => (args) => {
    calls.push(args);
    return { status, stdout: "", stderr: "" };
  };
  assert.strictEqual(mcpRegistered(fake(0)), true);
  assert.deepStrictEqual(calls[0], ["mcp", "get", "engram"]);
  assert.strictEqual(mcpRegistered(fake(1)), false);
  assert.strictEqual(mcpRegistered(() => ({ status: null, error: new Error("not found") })), false);
  register(fake(0));
  assert.deepStrictEqual(calls[calls.length - 1], REGISTER_ARGS);
});

// A fake claude CLI (a node script) so the checks are deterministic on any machine.
function fakeClaude(registered) {
  const f = path.join(tmp("sc-fake-claude-"), "claude.js");
  fs.writeFileSync(f, `const a = process.argv.slice(2); if (a[0] === "--version") { console.log("2.0.0"); process.exit(0); } if (a[0] === "mcp" && a[1] === "get") process.exit(${registered ? 0 : 1}); process.exit(0);`);
  return f;
}
const doctor = (claudeJs) => {
  const r = spawnSync(process.execPath, [path.join(root, "scripts", "doctor.js"), "--json", "--project", tmp("sc-doc-")], { encoding: "utf8", env: { ...process.env, SWIFTCRAFT_CLAUDE_JS: claudeJs } });
  return JSON.parse(r.stdout).checks.find((c) => c.title === "Engram MCP server");
};

test("claudeRunner honours SWIFTCRAFT_CLAUDE_JS", () => {
  const run = claudeRunner({ SWIFTCRAFT_CLAUDE_JS: fakeClaude(true) });
  assert.strictEqual(run(["--version"]).stdout.trim(), "2.0.0");
});

test("doctor reports whether Claude Code has the engram MCP server, and how to fix it", () => {
  const ok = doctor(fakeClaude(true));
  assert.strictEqual(ok.level, "OK");
  const missing = doctor(fakeClaude(false));
  assert.strictEqual(missing.level, "WARNING");
  assert.match(missing.detail, /mem_\*|MCP/);
  assert.match(missing.fix, /claude mcp add --scope user engram -- engram mcp/);
});

test("setup-engram checks the MCP registration and --apply registers it only after the binary check", () => {
  const src = fs.readFileSync(path.join(root, "scripts", "setup-engram.js"), "utf8");
  assert.match(src, /mcpRegistered/);
  assert.match(src, /register\(/);
  assert.match(src, /MCP server engram/);
  const r = spawnSync(process.execPath, [path.join(root, "scripts", "setup-engram.js")], { encoding: "utf8", env: { ...process.env, SWIFTCRAFT_CLAUDE_JS: fakeClaude(false) } });
  assert.match(r.stdout, /MISS MCP server engram/);
  const ok = spawnSync(process.execPath, [path.join(root, "scripts", "setup-engram.js")], { encoding: "utf8", env: { ...process.env, SWIFTCRAFT_CLAUDE_JS: fakeClaude(true) } });
  assert.match(ok.stdout, /OK\s+MCP server engram/);
});
