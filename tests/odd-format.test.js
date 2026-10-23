// Found by the evals: in a fresh project there is no odd/tasks/_template.md, and a model that cannot see the plugin
// folder invented its own document format. The format must therefore be self-contained in the skill, the command
// and every error message about it.
const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { tmp } = require("./helpers.js");

const root = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");
const { checkFeatureDoc, FORMAT_HINT } = require("../scripts/lib/odd.js");

const BROKEN = "# Feature: x\n\n## Request (user's exact words)\n\n> I want x\n\n## Size\n\nLarge\n";

test("the odd skill carries the exact document format inline, not only a pointer to a template file", () => {
  const s = read("skills", "odd", "SKILL.md");
  const block = s.match(/```markdown\n([\s\S]*?)\n```/);
  assert.ok(block, "the skill needs a fenced markdown example of the feature document");
  const example = block[1];
  for (const part of ["## Specs", "## Tasks", "## Log", "- S1:", "- [ ] T1 (S1)", "route: inline", "commit:", "done when:", "- L1 ("]) assert.ok(example.includes(part), `example misses ${part}`);
  assert.deepStrictEqual(checkFeatureDoc(example), [], "the example in the skill must itself pass the validator");
  assert.match(s, /fresh project|does not exist yet|new project/i, "explain that the template is not in the project");
  assert.match(s, /CLAUDE_PLUGIN_ROOT\}\/templates\/project\/odd\/tasks\/_template\.md/);
});

test("the odd command points to the template inside the plugin and repeats the section names", () => {
  const c = read("commands", "odd.md");
  assert.match(c, /CLAUDE_PLUGIN_ROOT\}\/templates\/project\/odd\/tasks\/_template\.md/);
  assert.match(c, /## Specs/);
  assert.match(c, /## Tasks/);
  assert.match(c, /## Log/);
});

test("FORMAT_HINT shows the sections and a complete task line", () => {
  for (const part of ["## Specs", "## Tasks", "## Log", "- S1:", "- [ ] T1 (S1)", "route: inline", "commit:", "done when:", "- L1 ("]) assert.ok(FORMAT_HINT.includes(part), `hint misses ${part}`);
  assert.deepStrictEqual(checkFeatureDoc(FORMAT_HINT.split("\n").filter((l) => !/^Expected format/.test(l)).join("\n").replace(/<[^>]+>/g, "x")), []);
});

test("odd-lint tells the agent the expected format, not only what is wrong", () => {
  const dir = tmp("sc-format-");
  fs.mkdirSync(path.join(dir, "odd", "tasks"), { recursive: true });
  const file = path.join(dir, "odd", "tasks", "x.md");
  fs.writeFileSync(file, BROKEN);
  const r = spawnSync(process.execPath, [path.join(root, "hooks", "scripts", "odd-lint.js")], { input: JSON.stringify({ tool_input: { file_path: file } }), encoding: "utf8" });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /Missing "## Specs" section/);
  assert.match(r.stderr, /Expected format/);
  assert.match(r.stderr, /- \[ \] T1 \(S1\)/);
  assert.match(r.stderr, /## Log/);
  assert.doesNotMatch(r.stderr, /C:\\Users|harness folder/i, "never send the agent to read files outside the project");
});

test("odd.js check prints the same format hint when a document has problems", () => {
  const dir = tmp("sc-format-");
  const file = path.join(dir, "x.md");
  fs.writeFileSync(file, BROKEN);
  const r = spawnSync(process.execPath, [path.join(root, "scripts", "odd.js"), "check", file], { encoding: "utf8" });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /Expected format/);
  assert.match(r.stdout, /- \[ \] T1 \(S1\)/);
});

test("a malformed task line is explained with the correct form", () => {
  const doc = "# t\n\n## Specs\n- S1: \"a\"\n\n## Tasks\n- [ ] T1 do it\n\n## Log\n- L1 (2026-10-22) a\n";
  const problems = checkFeatureDoc(doc);
  assert.ok(problems.some((p) => /Malformed task line/.test(p) && /T1 \(S1\)/.test(p)), JSON.stringify(problems));
});
