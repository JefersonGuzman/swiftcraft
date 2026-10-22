#!/usr/bin/env node
// Generate rule files for other coding agents from the project's AGENTS.md (single source of truth).
// Usage: node export-agents.js [targetDir] [--force]
//   .cursor/rules/swiftcraft.mdc            Cursor
//   GEMINI.md                         Gemini CLI (imports AGENTS.md)
//   .github/copilot-instructions.md   GitHub Copilot
// Codex and OpenCode read AGENTS.md natively. Existing files are kept unless --force.
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const force = args.includes("--force");
const target = path.resolve(args.find((a) => !a.startsWith("--")) || process.cwd());
const agentsPath = path.join(target, "AGENTS.md");

if (!fs.existsSync(agentsPath)) {
  console.error(`No AGENTS.md in ${target}. Run /swiftcraft:init first.`);
  process.exit(1);
}
const agents = fs.readFileSync(agentsPath, "utf8");

const outputs = {
  ".cursor/rules/swiftcraft.mdc": `---\ndescription: Project rules (generated from AGENTS.md)\nalwaysApply: true\n---\n\n${agents}`,
  "GEMINI.md": `# Project rules\n\n@./AGENTS.md\n`,
  ".github/copilot-instructions.md": agents,
};

for (const [rel, content] of Object.entries(outputs)) {
  const file = path.join(target, rel);
  if (fs.existsSync(file) && !force) {
    console.log(`skip   ${rel} (exists, use --force)`);
    continue;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`wrote  ${rel}`);
}
