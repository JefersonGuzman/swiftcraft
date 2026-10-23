const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { tmp } = require("./helpers.js");

const root = path.join(__dirname, "..");

test("the export writes the documented files from AGENTS.md", () => {
  const d = tmp("sc-export-");
  fs.writeFileSync(path.join(d, "AGENTS.md"), "# Rules\nCodeword PELICAN\n");
  const r = spawnSync(process.execPath, [path.join(root, "scripts", "export-agents.js"), d], { encoding: "utf8" });
  assert.strictEqual(r.status, 0);
  assert.match(fs.readFileSync(path.join(d, ".cursor", "rules", "swiftcraft.mdc"), "utf8"), /alwaysApply: true[\s\S]*PELICAN/);
  assert.match(fs.readFileSync(path.join(d, "GEMINI.md"), "utf8"), /@\.\/AGENTS\.md/);
  assert.match(fs.readFileSync(path.join(d, ".github", "copilot-instructions.md"), "utf8"), /PELICAN/);
});

test("the document says the pilot is not verified and how to verify it", () => {
  const doc = fs.readFileSync(path.join(root, "docs", "other-agents.md"), "utf8");
  assert.match(doc, /^Status: pilot not verified/m);
  for (const part of ["Gemini CLI", "Cursor", "Copilot", "Codex", "OpenCode", "not verified", "not tested", "authenticate"]) assert.match(doc, new RegExp(part, "i"), `missing ${part}`);
});
