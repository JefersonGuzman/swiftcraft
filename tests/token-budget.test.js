const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");

// Every session carries the name and description of each skill, agent and command (`claude plugin details` reports it as "Always-on").
// Measured: 2204 tokens before the trim, 1973 after, for about 5.3k characters of names and descriptions.
function listing() {
  const out = [];
  for (const d of fs.readdirSync(path.join(root, "skills"))) out.push([`skills/${d}`, read("skills", d, "SKILL.md"), d]);
  for (const f of fs.readdirSync(path.join(root, "agents")).filter((n) => n.endsWith(".md"))) out.push([`agents/${f}`, read("agents", f), f.replace(/\.md$/, "")]);
  for (const f of fs.readdirSync(path.join(root, "commands")).filter((n) => n.endsWith(".md"))) out.push([`commands/${f}`, read("commands", f), f.replace(/\.md$/, "")]);
  return out.map(([file, text, name]) => ({ file, name, description: ((text.match(/^description:\s*(.+?)\s*$/m) || [, ""])[1]) }));
}

test("the always-on listing (names and descriptions) stays inside the budget", () => {
  const items = listing();
  assert.ok(items.length >= 35, "found the components");
  for (const i of items) assert.ok(i.description.length > 20, `${i.file} needs a description`);
  const chars = items.reduce((n, i) => n + i.name.length + i.description.length, 0);
  assert.ok(chars <= 5500, `names and descriptions total ${chars} characters (about ${Math.round(chars / 4)} tokens at 4 chars per token); keep it at or under 5500 so the always-on cost stays below 2000 tokens`);
});

test("no single description is a paragraph", () => {
  for (const i of listing()) assert.ok(i.description.length <= 330, `${i.file}: ${i.description.length} characters; shorten it`);
});

test("the README states the always-on cost it can back up and how to measure it", () => {
  const r = read("README.md");
  assert.doesNotMatch(r, /about 950 tokens/);
  assert.match(r, /about 2,000 tokens of always-on context/);
  assert.match(r, /claude plugin details swiftcraft@swiftcraft/);
});
