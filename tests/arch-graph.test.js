const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { tmp } = require("./helpers.js");

const root = path.join(__dirname, "..");
const { checkGraph, importsOf } = require("../scripts/lib/arch-graph.js");

const write = (dir, rel, text) => {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};

function fixture() {
  const d = tmp("sc-arch-");
  write(d, "src/domain/direct.js", 'const db = require("../infrastructure/db");\n');
  write(d, "src/domain/order.js", 'const util = require("../shared/util");\nmodule.exports = util;\n');
  write(d, "src/domain/clean.js", 'const { x } = require("./direct-free");\n');
  write(d, "src/domain/direct-free.js", "exports.x = 1;\n");
  write(d, "src/shared/util.js", 'const db = require("../infrastructure/db");\nmodule.exports = db;\n');
  write(d, "src/infrastructure/db.js", 'const pg = require("pg");\nmodule.exports = pg;\n');
  write(d, "src/features/billing/charge.js", 'import { calc } from "../orders/internal/calc";\nexport const c = calc;\n');
  write(d, "src/features/billing/ok.js", 'import { api } from "../orders/index";\nexport const o = api;\n');
  write(d, "src/features/orders/index.js", 'export { calc as api } from "./internal/calc";\n');
  write(d, "src/features/orders/internal/calc.js", "export const calc = 1;\n");
  write(d, "src/shared/c1.js", 'import "./c2";\n');
  write(d, "src/shared/c2.js", 'import "./c1";\n');
  return d;
}

test("importsOf reads require, import, export-from and literal dynamic imports, but not comments or plain strings", () => {
  const src = [
    'import a from "./a";',
    'import "./side";',
    'export { b } from "./b";',
    'const c = require("./c");',
    'const d = await import("./d");',
    '// import nope from "./commented"',
    'const s = "from ./string";',
  ].join("\n");
  assert.deepStrictEqual(importsOf(src).sort(), ["./a", "./b", "./c", "./d", "./side"]);
});

test("the graph finds direct, transitive, cross-feature and cycle problems with the chain that proves each", () => {
  const r = checkGraph(fixture());
  const kinds = (k) => r.violations.filter((v) => v.kind === k);
  assert.ok(kinds("layer").some((v) => v.file === "src/domain/direct.js" && /infrastructure/.test(v.detail)));
  const t = kinds("transitive").find((v) => v.file === "src/domain/order.js");
  assert.ok(t, JSON.stringify(r.violations));
  assert.deepStrictEqual(t.chain, ["src/domain/order.js", "src/shared/util.js", "src/infrastructure/db.js"]);
  assert.ok(kinds("cross-feature").some((v) => v.file === "src/features/billing/charge.js" && /orders/.test(v.detail)));
  assert.ok(!r.violations.some((v) => v.file === "src/features/billing/ok.js"), "going through the public entry is fine");
  assert.ok(!r.violations.some((v) => v.file === "src/domain/clean.js"));
  const c = kinds("cycle");
  assert.strictEqual(c.length, 1);
  assert.deepStrictEqual([...c[0].chain].sort().slice(0, 2), ["src/shared/c1.js", "src/shared/c2.js"]);
  assert.ok(kinds("framework").length === 0 || kinds("framework").every((v) => v.file));
});

test("a domain file importing a forbidden framework directly is reported, and a clean project has no violations", () => {
  const d = tmp("sc-arch-");
  write(d, "src/domain/a.js", 'import express from "express";\n');
  assert.ok(checkGraph(d).violations.some((v) => v.kind === "framework" && v.file === "src/domain/a.js"));
  const clean = tmp("sc-arch-");
  write(clean, "src/domain/a.js", "export const a = 1;\n");
  write(clean, "src/application/b.js", 'import { a } from "../domain/a";\nexport const b = a;\n');
  assert.deepStrictEqual(checkGraph(clean).violations, []);
});

test("measured against the per-edit arch-lint on the same fixture, the graph finds what the hook cannot see", () => {
  const d = fixture();
  const hook = (rel) => spawnSync(process.execPath, [path.join(root, "hooks", "scripts", "arch-lint.js")], { input: JSON.stringify({ tool_input: { file_path: path.join(d, rel) } }), cwd: d, encoding: "utf8" }).status === 2;
  const domainFiles = ["src/domain/direct.js", "src/domain/order.js", "src/domain/clean.js"];
  const lintCaught = domainFiles.filter(hook);
  assert.deepStrictEqual(lintCaught, ["src/domain/direct.js"], "arch-lint sees only the direct import in the edited file");
  const graphCaught = new Set(checkGraph(d).violations.filter((v) => v.kind === "layer" || v.kind === "transitive").map((v) => v.file));
  assert.ok(graphCaught.has("src/domain/direct.js") && graphCaught.has("src/domain/order.js"));
  assert.ok(!graphCaught.has("src/domain/clean.js"), "no false positive on the clean domain file");
});

test("docs/arch-rules.json can add forbidden patterns, node_modules and tests are skipped", () => {
  const d = tmp("sc-arch-");
  write(d, "src/domain/a.js", 'import x from "left-pad";\n');
  write(d, "docs/arch-rules.json", JSON.stringify({ domainForbidden: ["left-pad"] }));
  write(d, "node_modules/pkg/domain/z.js", 'import x from "express";\n');
  write(d, "src/domain/a.test.js", 'import x from "express";\n');
  const r = checkGraph(d);
  assert.deepStrictEqual(r.violations.map((v) => v.file), ["src/domain/a.js"]);
});

test("CLI prints the report, --json is parseable and the exit code is 1 only with violations", () => {
  const d = fixture();
  const run = (cwd, ...a) => spawnSync(process.execPath, [path.join(root, "scripts", "arch-graph.js"), ...a], { cwd, encoding: "utf8" });
  const r = run(d, "check");
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /src\/domain\/order\.js/);
  assert.match(r.stdout, /->/);
  assert.ok(JSON.parse(run(d, "check", "--json").stdout).violations.length >= 4);
  const clean = tmp("sc-arch-");
  write(clean, "src/domain/a.js", "export const a = 1;\n");
  assert.strictEqual(run(clean, "check").status, 0);
  assert.strictEqual(run(clean).status, 1, "usage error");
});

test("the status of this proof of concept is documented, including what was not evaluated", () => {
  const doc = fs.readFileSync(path.join(root, "docs", "dependency-graph.md"), "utf8");
  for (const part of ["Status:", "arch-lint", "CodeGraph", "not evaluated", "JavaScript", "cycle", "transitive", "cross-feature"]) assert.match(doc, new RegExp(part, "i"), `missing ${part}`);
});
