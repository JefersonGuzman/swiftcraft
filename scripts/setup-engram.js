#!/usr/bin/env node
// Checks Engram prerequisites and, with --apply, installs the Engram Claude Code plugin.
// Usage: node setup-engram.js [--apply]
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const apply = process.argv.includes("--apply");
const MARKETPLACE = "Gentleman-Programming/engram";
const PLUGIN = "engram@engram";

const run = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8", shell: process.platform === "win32" });
const ok = (label, good, hint = "") => console.log(`${good ? "OK  " : "MISS"} ${label}${good || !hint ? "" : " -> " + hint}`);

// 0. Node.js >= 18 (the hooks and helper scripts are Node scripts)
const nodeMajor = Number(process.versions.node.split(".")[0]);
ok(`node ${process.versions.node}`, nodeMajor >= 18, "swiftcraft hooks need Node.js 18 or newer: https://nodejs.org");

// 1. engram binary
const bin = run("engram", ["version"]);
const hasBin = bin.status === 0;
ok("engram binary", hasBin, "install from https://github.com/Gentleman-Programming/engram (docs/INSTALLATION.md), then re-run");
if (hasBin) console.log("     " + (bin.stdout || "").trim().split("\n")[0]);

// 2. claude CLI
const hasClaude = run("claude", ["--version"]).status === 0;
ok("claude CLI", hasClaude, "needed only for --apply");

// 3. plugin enabled
let enabled = false;
try {
  const s = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", "settings.json"), "utf8"));
  enabled = !!(s.enabledPlugins || {})[PLUGIN];
} catch {}
ok(`plugin ${PLUGIN}`, enabled, apply ? "installing…" : "re-run with --apply to install");

if (apply && !enabled) {
  if (!hasClaude) {
    console.error("Cannot apply: claude CLI not found.");
    process.exit(1);
  }
  for (const args of [
    ["plugin", "marketplace", "add", MARKETPLACE],
    ["plugin", "install", PLUGIN],
  ]) {
    const r = run("claude", args);
    console.log(`$ claude ${args.join(" ")} -> exit ${r.status}`);
    if (r.status !== 0) {
      console.error((r.stderr || r.stdout || "").trim());
      process.exit(1);
    }
  }
  console.log("Done. Restart Claude Code to load Engram.");
}

console.log(hasBin && (enabled || apply) ? "\nEngram ready." : "\nEngram not fully set up (see MISS above). Memory falls back to docs/memory/.");

// 4. RTK (token saver, optional). --with-rtk installs it via winget (Windows) and registers the hook.
const hasRtk = run("rtk", ["gain"]).status === 0;
ok("rtk (token saver)", hasRtk, "optional; re-run with --apply --with-rtk (Windows: winget install rtk-ai.rtk, then rtk init -g)");
if (process.argv.includes("--with-rtk") && apply && !hasRtk) {
  if (process.platform !== "win32") {
    console.error("Auto-install is Windows-only here. Install rtk from https://github.com/rtk-ai/rtk, then run: rtk init -g");
    process.exit(1);
  }
  for (const [cmd, args] of [
    ["winget", ["install", "rtk-ai.rtk"]],
    ["rtk", ["init", "-g"]],
  ]) {
    const r = run(cmd, args);
    console.log(`$ ${cmd} ${args.join(" ")} -> exit ${r.status}`);
    if (r.status !== 0) {
      console.error((r.stderr || r.stdout || "").trim());
      console.error("If rtk was just installed, open a new terminal (PATH) and run: rtk init -g");
      process.exit(1);
    }
  }
  console.log("RTK installed. Restart Claude Code, then check savings with: rtk gain");
}
