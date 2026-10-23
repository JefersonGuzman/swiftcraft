// Deterministic lint of the eval suite in evals/. The evals themselves are probabilistic and run with
// `claude plugin eval` (they call a model and cost money); they are NOT part of `npm test`.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const evalsDir = path.join(root, "evals");
const cases = fs.readdirSync(evalsDir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== "results");

const frontmatter = (text) => {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: text };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w_]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return { fm, body: m[2] };
};

const PROMPT_KEYS = new Set(["schema_version", "name", "description", "tags", "plugins", "runs", "expected_outcome", "model", "max_turns", "timeout_seconds", "allowed_tools", "append_system_prompt", "env"]);
const GRADER_TYPES = new Set(["regex", "tool_used", "tool_order", "file_exists", "llm", "baseline"]);

test("the plan's behaviours each have an eval case", () => {
  const names = cases.map((c) => c.name);
  for (const needed of [
    "readonly-stays-readonly", // no scope creep without authorization
    "small-task-no-paperwork", // ODD sizing: small
    "large-task-gets-feature-document", // ODD sizing: large, user's words kept
    "test-results-reported-honestly", // runs the tests, reports failures
    "secret-file-not-written", // secret protection
    "destructive-command-blocked", // command guard
    "remote-publish-needs-confirmation", // no remote publishing without confirmation
    "status-from-document", // next step derived from the document (needs a shell)
    "status-without-script-does-not-invent", // no invented state without the script
  ]) assert.ok(names.includes(needed), `missing eval case ${needed}`);
});

test("every case has a valid prompt and at least one grader, and needs no scaffold script", () => {
  assert.ok(cases.length >= 8);
  for (const c of cases) {
    const dir = path.join(evalsDir, c.name);
    const { fm, body } = frontmatter(fs.readFileSync(path.join(dir, "prompt.md"), "utf8"));
    for (const key of Object.keys(fm)) assert.ok(PROMPT_KEYS.has(key), c.name + "/prompt.md: unknown key " + key);
    assert.ok(body.trim().length > 20, c.name + ": empty prompt");
    assert.match(fm.tags || "", /\w/, c.name + ": needs tags");
    assert.match(fm.tags, /noshell|shell/, c.name + ": tag it noshell (runs without a shell tool) or shell (needs the sandboxed Bash grant)");
    assert.ok(Number(fm.max_turns) >= 5 && Number(fm.max_turns) <= 60, c.name + ": max_turns");
    // scaffold scripts break on Windows (backslash paths) and run code as the user: the data lives in the prompt instead
    assert.ok(!fs.existsSync(path.join(dir, "case.yaml")) && !fs.existsSync(path.join(dir, "fixture.sh")), c.name + ": no case.yaml or fixture script");
    const graders = fs.readdirSync(path.join(dir, "graders")).filter((n) => n.endsWith(".md"));
    assert.ok(graders.length >= 1, c.name + ": needs a grader");
  }
});

test("every grader is well formed", () => {
  for (const c of cases) {
    const gdir = path.join(evalsDir, c.name, "graders");
    for (const g of fs.readdirSync(gdir)) {
      const label = `${c.name}/graders/${g}`;
      const { fm, body } = frontmatter(fs.readFileSync(path.join(gdir, g), "utf8"));
      assert.ok(GRADER_TYPES.has(fm.type), `${label}: unknown type ${fm.type}`);
      if (fm.type === "llm") {
        assert.match(body, /PASS if/, `${label}: rubric needs a PASS condition`);
        assert.match(body, /FAIL if/, `${label}: rubric needs a FAIL condition`);
      }
      if (fm.type === "tool_used") assert.ok(fm.tool, `${label}: tool_used needs tool`);
      if (fm.type === "file_exists") assert.ok(fm.path, `${label}: file_exists needs path`);
      if (fm.type === "regex") {
        assert.ok(fm.pattern, `${label}: regex needs pattern`);
        const pattern = fm.pattern.replace(/^'(.*)'$/, "$1");
        assert.doesNotThrow(() => new RegExp(pattern, (fm.flags || "").replace(/[^gimsuy]/g, "")), `${label}: pattern does not compile`);
      }
      if (fm.input_match) {
        const im = fm.input_match.replace(/^'(.*)'$/, "$1");
        assert.doesNotThrow(() => new RegExp(im), `${label}: input_match does not compile`);
      }
    }
  }
});

test("probabilistic cases are labelled, the suite is documented and results are ignored by git", () => {
  for (const c of cases) {
    const tags = frontmatter(fs.readFileSync(path.join(evalsDir, c.name, "prompt.md"), "utf8")).fm.tags;
    assert.match(tags, /probabilistic|hooks/, `${c.name}: tag it probabilistic (model behaviour) or hooks (plugin-enforced)`);
  }
  const readme = fs.readFileSync(path.join(evalsDir, "README.md"), "utf8");
  assert.match(readme, /claude plugin eval/);
  assert.match(readme, /not part of .?npm test/i);
  assert.match(readme, /--no-publish/);
  assert.match(fs.readFileSync(path.join(root, ".gitignore"), "utf8"), /^evals\/results\/$/m);
});

test("no secrets or personal paths in the eval suite", () => {
  const walk = (d) =>
    fs
      .readdirSync(d, { withFileTypes: true })
      .filter((e) => e.name !== "results") // run output is ignored by git and may contain local paths
      .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(evalsDir)) {
    const text = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(text, /C:\\Users|\/Users\/|lozano/i, `${f} has a personal path`);
    assert.doesNotMatch(text, /ghp_[A-Za-z0-9]{20}|AKIA[0-9A-Z]{16}/, `${f} has a token`);
  }
});
