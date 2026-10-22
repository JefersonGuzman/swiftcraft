#!/usr/bin/env node
// SessionStart: inject the project constitution + active spec pointer as context.
// Stdout of a SessionStart hook is added to the model context.
// `--compact` (matcher "compact"): after compaction, re-inject only the working state
// (open tasks) — Engram's own plugin handles memory recovery.
const fs = require("fs");
const path = require("path");

const compact = process.argv.includes("--compact");
const cwd = process.cwd();
const constitution = path.join(cwd, "docs", "constitution.md");
const MEMORY_HINT =
  "Memory: use the `memory` skill (Engram mem_* tools; call mem_current_project first). " +
  "Save decisions, fixes and discoveries proactively; run mem_session_summary before finishing.\n";

function latestSpec() {
  const specsDir = path.join(cwd, "specs");
  if (!fs.existsSync(specsDir)) return null;
  const dirs = fs
    .readdirSync(specsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name)
    .sort();
  return dirs.length ? dirs[dirs.length - 1] : null;
}

function openTasks(spec) {
  try {
    return fs
      .readFileSync(path.join(cwd, "specs", spec, "tasks.md"), "utf8")
      .split(/\r?\n/)
      .filter((l) => /^\s*- \[ \]/.test(l))
      .slice(0, 8);
  } catch {
    return [];
  }
}

const spec = latestSpec();

if (compact) {
  if (!spec) process.exit(0);
  const tasks = openTasks(spec);
  process.stdout.write(
    `# swiftcraft — context restored after compaction\nActive spec: specs/${spec}/\n` +
      (tasks.length ? `Open tasks:\n${tasks.join("\n")}\n` : "No open tasks.\n")
  );
  process.exit(0);
}

if (!fs.existsSync(constitution)) {
  process.stdout.write(MEMORY_HINT);
  process.exit(0);
}

const MAX = 4000;
let text = fs.readFileSync(constitution, "utf8");
if (text.length > MAX) text = text.slice(0, MAX) + "\n…(truncated)";
const active = spec ? `\nLatest spec folder: specs/${spec}/` : "";

process.stdout.write(
  `# swiftcraft — project rules (docs/constitution.md)\n${text}${active}\n` +
    `\nWorkflow: /swiftcraft:spec -> /swiftcraft:plan -> /swiftcraft:build (one task, tests first) -> /swiftcraft:review. Record decisions with /swiftcraft:adr.\n${MEMORY_HINT}`
);
