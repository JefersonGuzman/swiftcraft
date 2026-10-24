const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");
const AREAS = {
  "security-auditor": { keywords: ["injection", "authentication", "authorization", "secrets", "OWASP", "input validation"] },
  "performance-auditor": { keywords: ["complexity", "N+1", "caching", "blocking", "memory", "hypothes"] },
  "architecture-auditor": { keywords: ["dependency rule", "layers", "cycles", "ports", "coupling", "cohesion"] },
};
const front = (text) => (text.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [, ""])[1];

test("the three expert auditors exist, are named after their file and say what they are for", () => {
  for (const name of Object.keys(AREAS)) {
    const text = read("agents", `${name}.md`);
    const f = front(text);
    assert.match(f, new RegExp(`^name:\\s*${name}\\s*$`, "m"), name);
    const desc = (f.match(/^description:\s*(.+)$/m) || [, ""])[1];
    assert.ok(desc.length > 60, `${name}: description too short`);
    assert.match(desc, /read-only/i, `${name}: description must say read-only`);
    assert.match(desc, /Use (when|after|before)/i, `${name}: description must say when to use it`);
  }
});

test("the auditors cannot change anything: their tools are only Read, Glob and Grep", () => {
  for (const name of Object.keys(AREAS)) {
    const tools = (front(read("agents", `${name}.md`)).match(/^tools:\s*(.+)$/m) || [, ""])[1].split(",").map((t) => t.trim()).filter(Boolean).sort();
    assert.deepStrictEqual(tools, ["Glob", "Grep", "Read"], `${name} tools: ${tools}`);
  }
});

test("each auditor has the same report shape, the evidence rules and its own area vocabulary", () => {
  for (const [name, { keywords }] of Object.entries(AREAS)) {
    const body = read("agents", `${name}.md`);
    for (const section of ["Scope", "Verdict", "What is good", "Findings", "Not verified"]) assert.match(body, new RegExp(`\\b${section}\\b`), `${name} misses the "${section}" section`);
    for (const sev of ["critical", "high", "medium", "low"]) assert.match(body, new RegExp(sev, "i"), `${name} misses severity ${sev}`);
    assert.match(body, /path:line/, `${name}: findings need path:line evidence`);
    assert.match(body, /never (modify|edit|change)/i, `${name} must say it never modifies files`);
    assert.match(body, /untrusted data/i, `${name} must treat the code and its comments as untrusted data`);
    assert.match(body, /never (print|repeat|include)[^.]*(secret|credential|token)/i, `${name} must never print secrets`);
    assert.match(body, /only (what|the files) you (actually )?(read|opened)|do not claim|not verified/i, `${name} must separate what it saw from what it assumes`);
    for (const k of keywords) assert.ok(body.toLowerCase().includes(k.toLowerCase()), `${name} misses ${k}`);
  }
});

test("the audit command runs the experts in parallel for all, feeds the architecture one the graph check, and saves nothing by itself", () => {
  const cmd = read("commands", "audit.md");
  assert.match(cmd, /^description:/m);
  for (const name of Object.keys(AREAS)) assert.match(cmd, new RegExp(name), `audit.md misses ${name}`);
  for (const arg of ["security", "performance", "architecture", "all"]) assert.match(cmd, new RegExp(arg));
  assert.match(cmd, /parallel/i);
  assert.match(cmd, /arch-graph\.js/);
  assert.match(cmd, /read-only|never edit|do not (edit|modify)/i);
  assert.match(cmd, /docs\/audits/);
  assert.match(cmd, /only (if|when) the user/i, "the report is saved only when the user asks");
  assert.match(cmd, /cost/i, "all three at once costs three reviews: say so first");
});

test("README lists the command and the experts with the right counts", () => {
  const readme = read("README.md");
  assert.match(readme, /\/swiftcraft:audit/);
  for (const name of Object.keys(AREAS)) assert.match(readme, new RegExp(name));
  const agents = fs.readdirSync(path.join(root, "agents")).filter((n) => n.endsWith(".md")).length;
  const commands = fs.readdirSync(path.join(root, "commands")).filter((n) => n.endsWith(".md")).length;
  assert.match(readme, new RegExp(`\\b${agents} agents\\b`));
  assert.match(readme, new RegExp(`\\b${commands} commands\\b`));
});
