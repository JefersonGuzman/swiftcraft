const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const ALLOWED = /^(sonnet|opus|haiku|fable|inherit|claude-[a-z0-9.-]+)$/;
const agents = fs.readdirSync(path.join(root, "agents")).filter((n) => n.endsWith(".md"));
const front = (n) => (fs.readFileSync(path.join(root, "agents", n), "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/) || [, ""])[1];

test("an agent's model, when set, is a value Claude Code accepts", () => {
  for (const n of agents) {
    const m = front(n).match(/^model:\s*(.+?)\s*$/m);
    if (m) assert.match(m[1], ALLOWED, `${n}: model "${m[1]}"`);
  }
});

test("no agent pins a model until the comparison in docs/model-per-role.md has been recorded", () => {
  const doc = fs.readFileSync(path.join(root, "docs", "model-per-role.md"), "utf8");
  const validated = /^Status: validated/m.test(doc);
  const pinned = agents.filter((n) => /^model:/m.test(front(n)));
  if (!validated) assert.deepStrictEqual(pinned, [], "models are pinned but the document does not say they were validated");
});

test("the document states the status, the supported values, what is not verified and how to validate", () => {
  const doc = fs.readFileSync(path.join(root, "docs", "model-per-role.md"), "utf8");
  assert.match(doc, /^Status: (not enabled|validated)/m);
  for (const part of ["sonnet", "opus", "haiku", "inherit", "CLAUDE_CODE_SUBAGENT_MODEL", "plugin", "not verified", "claude plugin eval", "--model"]) assert.match(doc, new RegExp(part, "i"), `missing ${part}`);
  for (const a of ["architect", "explorer", "reviewer", "pr-reviewer"]) assert.match(doc, new RegExp(a), `missing role ${a}`);
});
