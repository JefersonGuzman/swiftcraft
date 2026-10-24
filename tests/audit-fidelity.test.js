const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");

test("the audit command pastes each expert's report verbatim instead of rewriting it", () => {
  const cmd = read("commands", "audit.md");
  assert.match(cmd, /verbatim/i, "must say the report is relayed verbatim");
  assert.match(cmd, /(do not|never) (rewrite|paraphrase|summari[sz]e)/i, "must forbid rewriting or paraphrasing the report");
  assert.match(cmd, /whole table|every finding|complete report/i, "must keep every finding");
  assert.match(cmd, /own words|your own comments?|after the (reports?|expert)/i, "the lead's own notes go after the report, clearly apart");
});

test("the architecture expert never claims to have run the graph check: it can only use output the caller passed", () => {
  const agent = read("agents", "architecture-auditor.md");
  assert.match(agent, /cannot run/i);
  assert.match(agent, /graph output (was|is) (provided|passed) by the caller|no graph output (was|is) (provided|passed)/i, "Scope must say whether graph output was provided");
  assert.match(agent, /never (say|claim|state)[^.]*(ran|run|executed)[^.]*(arch-graph|graph)/i, "must never claim it ran the graph check");
  const cmd = read("commands", "audit.md");
  assert.match(cmd, /graph check cannot run/i, "the command must handle a graph check that cannot run");
  assert.match(cmd, /no graph output|not available/i, "and tell the expert there is no graph output");
});

test("the other experts are told the same: they only read, they never claim to have run anything", () => {
  for (const name of ["security-auditor", "performance-auditor"]) {
    const body = read("agents", `${name}.md`);
    assert.match(body, /cannot run/i, `${name} must state it cannot run anything`);
    assert.match(body, /never (say|claim|state)[^.]*(ran|run|executed|tested)/i, `${name} must never claim to have run anything`);
  }
});
