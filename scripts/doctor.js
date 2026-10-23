#!/usr/bin/env node
// swiftcraft doctor: a READ-ONLY diagnosis of the plugin and the current project.
//   node doctor.js [--project <dir>] [--root <plugin dir>] [--json]
// Every check reports OK, WARNING or ERROR with the cause and, when there is one, a fix. Required parts
// (Node.js, manifest, hooks, scripts) are ERRORs; optional tools (gh, claude, engram, rtk) only ever WARN.
// The exit code is 1 only when there is at least one ERROR. Nothing is created, changed or deleted: the hook
// smoke tests use inputs that write nothing, and scratch folders are only listed.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { checkFeatureDoc } = require("./lib/odd.js");

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const ROOT = path.resolve(opt("--root") || path.join(__dirname, ".."));
const PROJECT = path.resolve(opt("--project") || process.cwd());
const TMP = process.env.SWIFTCRAFT_TMP_DIR || os.tmpdir();
const HOUR = 3600 * 1000;

const checks = [];
const add = (level, title, detail = "", fix = "") => checks.push({ level, title, detail, fix });
const exists = (p) => fs.existsSync(p);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

function run(cmd, args, input) {
  const shell = process.platform === "win32" && cmd === "claude";
  return spawnSync(cmd, args, { encoding: "utf8", input, timeout: 8000, shell, windowsHide: true });
}

// --- required -------------------------------------------------------------------------------------------------
const major = Number(process.versions.node.split(".")[0]);
if (major >= 18) add("OK", "Node.js", `v${process.versions.node}`);
else add("ERROR", "Node.js", `v${process.versions.node} is too old`, "Install Node.js 18 or newer: https://nodejs.org");

let version = "?";
try {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  if (!m.name || !m.version) throw new Error("name or version missing");
  version = m.version;
  add("OK", "Plugin manifest", `${m.name} ${m.version}`);
} catch (e) {
  add("ERROR", "Plugin manifest", `.claude-plugin/plugin.json is missing or invalid (${e.message})`, "Reinstall the plugin: claude plugin update swiftcraft@swiftcraft (or git pull in the harness folder)");
}

try {
  const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, "hooks", "hooks.json"), "utf8")).hooks || {};
  const missing = [];
  let commands = 0;
  for (const groups of Object.values(hooks)) {
    for (const group of groups) {
      for (const h of group.hooks || []) {
        commands++;
        const m = String(h.command || "").match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)/);
        if (m && !exists(path.join(ROOT, m[1]))) missing.push(m[1]);
      }
    }
  }
  if (missing.length) add("ERROR", "Hooks configuration", `hooks.json points to scripts that do not exist: ${[...new Set(missing)].join(", ")}`, "Reinstall the plugin: claude plugin update swiftcraft@swiftcraft (or git pull in the harness folder)");
  else add("OK", "Hooks configuration", `${commands} hook commands in ${Object.keys(hooks).length} events, every script exists`);
} catch (e) {
  add("ERROR", "Hooks configuration", `hooks/hooks.json is missing or invalid (${e.message})`, "Reinstall the plugin: claude plugin update swiftcraft@swiftcraft (or git pull in the harness folder)");
}

const jsFiles = [];
const walk = (dir) => {
  if (!exists(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js")) jsFiles.push(p);
  }
};
walk(path.join(ROOT, "hooks", "scripts"));
walk(path.join(ROOT, "scripts"));
if (!jsFiles.length) {
  add("WARNING", "Scripts parse", "no scripts found under hooks/scripts or scripts");
} else {
  const bad = jsFiles.filter((f) => run(process.execPath, ["--check", f]).status !== 0).map(rel);
  if (bad.length) add("ERROR", "Scripts parse", `syntax errors in: ${bad.join(", ")}`, "Reinstall the plugin: claude plugin update swiftcraft@swiftcraft (or git pull in the harness folder)");
  else add("OK", "Scripts parse", `${jsFiles.length} scripts pass node --check`);
}

const hook = (name) => path.join(ROOT, "hooks", "scripts", name);
if (!exists(hook("protect-files.js")) || !exists(hook("odd-lint.js")) || !exists(hook("arch-lint.js")) || !exists(hook("command-guard.js"))) {
  add("WARNING", "Hooks respond", "skipped: protect-files, odd-lint, arch-lint or command-guard is missing");
} else {
  const failures = [];
  const smoke = (name, input, expected) => {
    const r = run(process.execPath, [hook(name)], JSON.stringify({ tool_input: { file_path: input } }));
    if (r.status !== expected) failures.push(`${name} exited ${r.status} (expected ${expected})`);
  };
  smoke("protect-files.js", "project/.env", 2); // a secret file must be blocked
  smoke("protect-files.js", "project/.env.example", 0); // the template must be allowed
  smoke("odd-lint.js", path.join(os.tmpdir(), "swiftcraft-doctor-nonexistent", "odd", "tasks", "x.md"), 0); // nothing to lint
  smoke("arch-lint.js", "project/README.md", 0); // not a source file
  const guard = (command) => run(process.execPath, [hook("command-guard.js")], JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: os.tmpdir() }));
  const blocked = guard("rm -rf /");
  if (blocked.status !== 0 || !String(blocked.stdout).includes('"permissionDecision":"deny"')) failures.push("command-guard did not block a catastrophic command");
  const harmless = guard("ls");
  if (harmless.status !== 0 || String(harmless.stdout).trim() !== "") failures.push("command-guard reacted to a harmless command");
  if (failures.length) add("ERROR", "Hooks respond", failures.join("; "), "Reinstall the plugin or open an issue with this output");
  else add("OK", "Hooks respond", "6 smoke tests behave as expected (the command guard blocks and stays silent when it should)");
}

// --- the current project --------------------------------------------------------------------------------------
if (exists(path.join(PROJECT, "docs", "constitution.md"))) add("OK", "Project initialized", "docs/constitution.md found");
else add("WARNING", "Project initialized", `no docs/constitution.md in ${PROJECT}`, "Run /swiftcraft:init in the project (read-only checks of the plugin itself are unaffected)");

const guardFile = path.join(PROJECT, "docs", "guard-rules.json");
if (!exists(guardFile)) {
  add("OK", "Guard rules", "no project rules (the defaults apply)");
} else {
  try {
    const g = JSON.parse(fs.readFileSync(guardFile, "utf8"));
    if (!g || typeof g !== "object" || Array.isArray(g)) throw new Error("it must be a JSON object");
    add("OK", "Guard rules", "docs/guard-rules.json is valid (deny rules can never be relaxed by it)");
  } catch (e) {
    add("WARNING", "Guard rules", `docs/guard-rules.json is invalid (${e.message}); the defaults apply`, "Fix the JSON, or delete the file");
  }
}

const tasksDir = path.join(PROJECT, "odd", "tasks");
const docs = exists(tasksDir) ? fs.readdirSync(tasksDir).filter((n) => n.endsWith(".md") && !n.startsWith("_")) : [];
if (!docs.length) {
  add("OK", "Feature documents", "none (fine: small tasks need no document)");
} else {
  const broken = [];
  for (const n of docs) {
    const problems = checkFeatureDoc(fs.readFileSync(path.join(tasksDir, n), "utf8"));
    if (problems.length) broken.push(`${n}: ${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ""}`);
  }
  if (broken.length) add("WARNING", "Feature documents", broken.join(" | "), "Run node scripts/odd.js check odd/tasks/<file> and fix the listed problems");
  else add("OK", "Feature documents", `${docs.length} document(s), all valid`);
}

const entries = exists(TMP) ? fs.readdirSync(TMP, { withFileTypes: true }) : [];
const age = (p) => Date.now() - fs.statSync(p).mtimeMs;
const scratch = entries
  .filter((e) => e.isDirectory() && /^swiftcraft-pr-\d+-[A-Za-z0-9]{4,}$/.test(e.name) && age(path.join(TMP, e.name)) > 24 * HOUR)
  .map((e) => e.name);
if (scratch.length) {
  const shown = scratch.slice(0, 5).join(", ") + (scratch.length > 5 ? `, … (+${scratch.length - 5} more)` : "");
  add("WARNING", "Scratch folders", `${scratch.length} pull-request scratch folder(s) older than 24 h in ${TMP}: ${shown}`, "See them with: node scripts/cleanup.js (dry run), delete with --apply. This command itself never deletes anything");
} else add("OK", "Scratch folders", "no old pull-request scratch folders");

const stateFiles = entries
  .filter((e) => e.isFile() && /^swiftcraft-[\w-]+\.json$/.test(e.name) && e.name !== "swiftcraft-update-check.json" && age(path.join(TMP, e.name)) > 7 * 24 * HOUR)
  .map((e) => e.name);
if (stateFiles.length) add("WARNING", "State files", `${stateFiles.length} session state file(s) older than 7 days in ${TMP}`, "They are pruned automatically when the next session starts");
else add("OK", "State files", "no stale session state files");

// --- optional tools (never an ERROR) --------------------------------------------------------------------------
const gh = run("gh", ["--version"]);
if (gh.error || gh.status !== 0) add("WARNING", "GitHub CLI", "not found (optional: only /swiftcraft:pr-review needs it)", "Install it from https://cli.github.com, then run gh auth login");
else if (run("gh", ["auth", "status"]).status !== 0) add("WARNING", "GitHub CLI", "installed but not authenticated (optional: only /swiftcraft:pr-review needs it)", "Run gh auth login");
else add("OK", "GitHub CLI", String(gh.stdout).split("\n")[0].trim());

const optional = [
  ["Claude CLI", "claude", ["--version"], "only the update commands (claude plugin update) need it", "Install Claude Code"],
  ["Engram", "engram", ["version"], "memory falls back to docs/memory/ without it", "Run /swiftcraft:setup"],
  ["RTK", "rtk", ["--version"], "only the token-saving compression needs it", "Run /swiftcraft:setup, or ignore it"],
];
for (const [title, cmd, args, why, fix] of optional) {
  const r = run(cmd, args);
  if (r.error || r.status !== 0) add("WARNING", title, `not found (optional: ${why})`, fix);
  else add("OK", title, String(r.stdout).split("\n")[0].trim());
}

// --- report ---------------------------------------------------------------------------------------------------
const summary = {
  ok: checks.filter((c) => c.level === "OK").length,
  warnings: checks.filter((c) => c.level === "WARNING").length,
  errors: checks.filter((c) => c.level === "ERROR").length,
};
if (argv.includes("--json")) {
  console.log(JSON.stringify({ root: ROOT, project: PROJECT, version, checks, summary }, null, 2));
} else {
  console.log(`swiftcraft doctor — plugin ${version} (${ROOT})\nproject: ${PROJECT}\n`);
  for (const c of checks) {
    console.log(`${c.level.padEnd(8)} ${c.title}${c.detail ? ` — ${c.detail}` : ""}`);
    if (c.fix) console.log(`         Fix: ${c.fix}`);
  }
  console.log(`\nSummary: ${summary.ok} ok, ${summary.warnings} warning(s), ${summary.errors} error(s). Read-only: nothing was changed.`);
}
process.exit(summary.errors ? 1 : 0);
