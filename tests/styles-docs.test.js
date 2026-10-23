const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const dir = path.join(root, "output-styles");
const styles = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith(".md")) : [];
const front = (text) => (text.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [, ""])[1];

test("two optional output styles ship, namespaced and never forced on the user", () => {
  assert.deepStrictEqual(styles.sort(), ["swiftcraft-explained.md", "swiftcraft-lean.md"]);
  for (const n of styles) {
    const text = fs.readFileSync(path.join(dir, n), "utf8");
    const f = front(text);
    assert.match(f, /^name:\s*\S/m, n);
    assert.match(f, /^description:\s*\S/m, n);
    assert.match(f, /^keep-coding-instructions:\s*true\s*$/m, `${n} must keep the coding instructions`);
    assert.doesNotMatch(f, /force-for-plugin:\s*true/, `${n} must not be forced`);
  }
});

test("styles change tone and length only: they never relax tests, permissions, safety or honesty", () => {
  for (const n of styles) {
    const body = fs.readFileSync(path.join(dir, n), "utf8");
    for (const part of ["tests", "permission", "Risk", "not verified"]) assert.match(body, new RegExp(part, "i"), `${n} misses ${part}`);
    assert.doesNotMatch(body, /skip (the )?tests|ignore (the )?(guard|hooks)|without asking for confirmation/i, n);
  }
  const lean = fs.readFileSync(path.join(dir, "swiftcraft-lean.md"), "utf8");
  assert.match(lean, /failing test output|error/i);
  assert.match(lean, /destructive/i);
});

test("the README explains how to pick a style and that none is on by default", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  assert.match(readme, /swiftcraft-lean/);
  assert.match(readme, /swiftcraft-explained/);
  assert.match(readme, /\/output-style/);
});

test("documentation sources: prefer a docs MCP only if present, and say what was consulted", () => {
  const s = fs.readFileSync(path.join(root, "skills", "context-hygiene", "SKILL.md"), "utf8");
  for (const part of ["documentation", "MCP", "Consulted", "general knowledge", "not verified"]) assert.match(s, new RegExp(part, "i"), `missing ${part}`);
  assert.match(s, /if (a|one) .*available/i);
});
