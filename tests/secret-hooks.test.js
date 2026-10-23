const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const { isSecretFile } = require("../scripts/lib/secrets.js");
const run = (script, input, env = {}) =>
  spawnSync(process.execPath, [path.join(root, "hooks", "scripts", script)], { input: typeof input === "string" ? input : JSON.stringify(input), encoding: "utf8", env: { ...process.env, SWIFTCRAFT_NO_PROMPT_SCAN: "", ...env } });
const decision = (r) => {
  if (!r.stdout.trim()) return null;
  const o = JSON.parse(r.stdout);
  return o.hookSpecificOutput ? o.hookSpecificOutput.permissionDecision : o.decision;
};
const TOKEN = "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";

test("isSecretFile: secrets and keys yes, templates and ordinary files no; reads also cover credential stores", () => {
  for (const p of [".env", "app/.env.local", "C:\\proj\\.env.production", "server.pem", "a/b/id_rsa", "id_ed25519.pub".replace(".pub", ""), "cert.p12", "x.key"]) assert.strictEqual(isSecretFile(p), true, p);
  for (const p of [".env.example", ".env.sample", "src/env.js", "README.md", "notes/id.md","keyboard.js"]) assert.strictEqual(isSecretFile(p), false, p);
  for (const p of [".npmrc", "home/.aws/credentials", ".netrc", ".git-credentials", ".pypirc"]) {
    assert.strictEqual(isSecretFile(p), false, `${p} is not blocked for writes`);
    assert.strictEqual(isSecretFile(p, { read: true }), true, `${p} is asked about for reads`);
  }
});

test("read-guard asks before Read or Grep touch a secret file, and stays silent otherwise", () => {
  const ask = (tool_name, tool_input) => decision(run("read-guard.js", { tool_name, tool_input }));
  assert.strictEqual(ask("Read", { file_path: "C:\\proj\\.env" }), "ask");
  assert.strictEqual(ask("Read", { file_path: "/home/u/.ssh/id_rsa" }), "ask");
  assert.strictEqual(ask("Read", { file_path: "/home/u/.aws/credentials" }), "ask");
  assert.strictEqual(ask("Grep", { pattern: "KEY", path: "/p/.env" }), "ask");
  assert.strictEqual(ask("Grep", { pattern: "KEY", glob: ".env*" }), "ask");
  assert.strictEqual(ask("Read", { file_path: "/p/.env.example" }), null);
  assert.strictEqual(ask("Read", { file_path: "/p/src/a.js" }), null);
  assert.strictEqual(ask("Grep", { pattern: "KEY", path: "/p/src" }), null);
  assert.strictEqual(ask("Write", { file_path: "/p/.env" }), null, "writes are protect-files' job");
  const r = run("read-guard.js", { tool_name: "Read", tool_input: { file_path: "/p/.env" } });
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, /secret/i);
  assert.strictEqual(run("read-guard.js", "not json").status, 0);
});

test("prompt-guard blocks a prompt that contains a credential and never repeats it", () => {
  const r = run("prompt-guard.js", { hook_event_name: "UserPromptSubmit", prompt: `use this token ${TOKEN} to push` });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(decision(r), "block");
  const out = JSON.parse(r.stdout);
  assert.ok(!r.stdout.includes(TOKEN));
  assert.match(out.reason, /credential|secret/i);
  assert.match(out.reason, /rotate|revoke/i);
  assert.strictEqual(decision(run("prompt-guard.js", { prompt: "-----BEGIN RSA PRIVATE KEY-----\nabc" })), "block");
  assert.strictEqual(decision(run("prompt-guard.js", { prompt: "please explain what a token like ghp_ looks like" })), null);
  assert.strictEqual(decision(run("prompt-guard.js", { prompt: "fix the login bug" })), null);
  assert.strictEqual(decision(run("prompt-guard.js", { prompt: TOKEN }, { SWIFTCRAFT_NO_PROMPT_SCAN: "1" })), null, "documented escape hatch");
  assert.strictEqual(run("prompt-guard.js", "not json").status, 0);
});

test("settings-guard asks before the agent edits Claude Code settings, where hooks and permissions live", () => {
  const ask = (file_path, tool_name = "Write") => decision(run("settings-guard.js", { tool_name, tool_input: { file_path } }));
  assert.strictEqual(ask("/p/.claude/settings.json"), "ask");
  assert.strictEqual(ask("C:\\p\\.claude\\settings.local.json", "Edit"), "ask");
  assert.strictEqual(ask("/home/u/.claude/settings.json", "MultiEdit"), "ask");
  assert.strictEqual(ask("/p/src/settings.json"), null);
  assert.strictEqual(ask("/p/.claude/commands/x.md"), null);
  assert.strictEqual(ask("/p/swiftcraft.config.json"), null);
  const r = run("settings-guard.js", { tool_name: "Write", tool_input: { file_path: "/p/.claude/settings.json" } });
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, /hooks|permissions/i);
});

test("hooks.json registers the three new guards on the right events", () => {
  const h = JSON.parse(fs.readFileSync(path.join(root, "hooks", "hooks.json"), "utf8")).hooks;
  const find = (event, script) => (h[event] || []).find((e) => e.hooks.some((x) => x.command.includes(script)));
  const read = find("PreToolUse", "read-guard.js");
  assert.ok(read && /Read/.test(read.matcher) && /Grep/.test(read.matcher));
  const settings = find("PreToolUse", "settings-guard.js");
  assert.ok(settings && /Write/.test(settings.matcher) && /Edit/.test(settings.matcher));
  assert.ok(find("UserPromptSubmit", "prompt-guard.js"));
});

test("protect-files still blocks writes to secret files after sharing the predicate", () => {
  const r = run("protect-files.js", { tool_name: "Write", tool_input: { file_path: "/p/.env" } });
  assert.strictEqual(r.status, 2);
  assert.strictEqual(run("protect-files.js", { tool_name: "Write", tool_input: { file_path: "/p/.env.example" } }).status, 0);
});

test("docs/hooks.md lists every event with a reason for using it or not, and the README matches", () => {
  const doc = fs.readFileSync(path.join(root, "docs", "hooks.md"), "utf8");
  for (const ev of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "SubagentStop", "PreCompact", "SessionEnd", "ConfigChange", "PermissionRequest", "Notification"]) assert.match(doc, new RegExp(ev), `docs/hooks.md misses ${ev}`);
  for (const script of fs.readdirSync(path.join(root, "hooks", "scripts"))) assert.ok(doc.includes(script), `docs/hooks.md does not mention ${script}`);
  const count = fs.readdirSync(path.join(root, "hooks", "scripts")).length + 1; // + the update notice script
  assert.match(fs.readFileSync(path.join(root, "README.md"), "utf8"), new RegExp(`\\b${count} hooks\\b`));
});
