const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { tmp } = require("./helpers.js");

const root = path.join(__dirname, "..");
const { scan } = require("../scripts/lib/adopt.js");
const cli = (args, cwd, env = {}) => spawnSync(process.execPath, [path.join(root, "scripts", "adopt.js"), ...args], { cwd, encoding: "utf8", env: { ...process.env, ...env } });

function project(files, { git = false, commits = [] } = {}) {
  const dir = tmp("sc-adopt-");
  for (const [rel, text] of Object.entries(files)) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
  if (git) {
    const g = (...a) => spawnSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { encoding: "utf8" });
    g("init", "-q", "-b", "main");
    for (const msg of commits.length ? commits : ["init"]) g("commit", "-q", "--allow-empty", "-m", msg);
  }
  return dir;
}
const snapshot = (dir) =>
  fs
    .readdirSync(dir, { recursive: true })
    .filter((p) => !String(p).startsWith(".git"))
    .sort()
    .map((p) => `${p}:${fs.statSync(path.join(dir, p)).isFile() ? fs.readFileSync(path.join(dir, p), "utf8").length : "dir"}`);

const NODE_TS = {
  "package.json": JSON.stringify({ name: "shop-api", scripts: { test: "vitest run", lint: "eslint .", build: "tsc -p ." }, dependencies: { express: "^4" }, devDependencies: { typescript: "^5", vitest: "^1" } }),
  "package-lock.json": "{}",
  "tsconfig.json": "{}",
  "eslint.config.js": "export default [];",
  ".editorconfig": "root = true",
  "src/orders/domain/order.ts": "export class Order {}",
  "src/orders/application/place-order.ts": "export const placeOrder = () => 1;",
  "src/orders/infrastructure/repo.ts": "export const repo = {};",
  "src/index.ts": "console.log(1);",
  "tests/order.test.ts": "test('x', () => {});",
  ".github/workflows/ci.yml": "name: ci\njobs:\n  test:\n    steps:\n      - run: npm ci\n      - run: npm test\n      - run: |\n          npm run lint\n          npm run build\n",
  "README.md": "# Shop API\n\nOrders for the shop.\n",
  ".env.example": "KEY=changeme\n",
};

test("scan reports observed facts for a Node + TypeScript project", () => {
  const dir = project(NODE_TS, { git: true, commits: ["feat: add orders", "fix(api): handle empty cart", "docs: readme", "chore: deps"] });
  const r = scan(dir);
  const o = r.observed;
  assert.strictEqual(o.languages[0].name, "TypeScript");
  assert.deepStrictEqual(o.packageJson.scripts.test, "vitest run");
  assert.strictEqual(o.packageManager, "npm");
  assert.ok(o.manifests.includes("package.json") && o.manifests.includes("tsconfig.json"));
  assert.ok(o.tooling.some((t) => /eslint/.test(t)) && o.tooling.includes(".editorconfig"));
  assert.ok(o.tests.files >= 1);
  assert.deepStrictEqual(o.ci[0].commands.sort(), ["npm ci", "npm run build", "npm run lint", "npm test"]);
  assert.strictEqual(o.git.isRepo, true);
  assert.ok(o.git.conventionalRatio >= 0.99, `ratio ${o.git.conventionalRatio}`);
  assert.ok(o.structure.layerDirs.includes("domain") && o.structure.layerDirs.includes("application") && o.structure.layerDirs.includes("infrastructure"));
  assert.strictEqual(o.docs.readme, true);
  assert.strictEqual(o.env.example, true);
});

test("inferences are separate from facts, carry evidence and a confidence, and never invent commands", () => {
  const dir = project(NODE_TS, { git: true, commits: ["feat: a"] });
  const r = scan(dir);
  assert.ok(Array.isArray(r.inferred) && r.inferred.length >= 2);
  for (const i of r.inferred) {
    assert.ok(i.claim && i.evidence.length >= 1 && ["high", "medium", "low"].includes(i.confidence), JSON.stringify(i));
  }
  assert.ok(r.inferred.some((i) => /Hexagonal|layers/i.test(i.claim)));
  assert.ok(r.inferred.some((i) => /Express/i.test(i.claim)));
  assert.strictEqual(r.observed.commands.test, "npm test", "the test command comes from package.json, observed");
  assert.strictEqual(r.observed.commands.lint, "npm run lint");
  assert.strictEqual(r.observed.commands.build, "npm run build");
});

test("a Python project: pytest is inferred from config, not presented as an observed command", () => {
  const dir = project({
    "pyproject.toml": "[project]\nname = 'api'\n\n[tool.pytest.ini_options]\ntestpaths = ['tests']\n\n[tool.ruff]\nline-length = 100\n",
    "requirements.txt": "fastapi\nuvicorn\n",
    "app/main.py": "print(1)\n",
    "tests/test_main.py": "def test_x(): pass\n",
  });
  const r = scan(dir);
  assert.strictEqual(r.observed.languages[0].name, "Python");
  assert.strictEqual(r.observed.commands.test, undefined, "no test command is stated anywhere");
  assert.ok(r.inferred.some((i) => /pytest/i.test(i.claim) && i.confidence !== "high"));
  assert.ok(r.inferred.some((i) => /FastAPI/i.test(i.claim)));
  assert.ok(r.uncertainties.some((u) => /test command/i.test(u)));
});

test("manifests in first-level subfolders are found, with their stated commands, instead of 'no manifest'", () => {
  const dir = project({
    "backend/requirements.txt": "fastapi\n",
    "backend/app/main.py": "print(1)\n",
    "frontend/package.json": JSON.stringify({ name: "web", scripts: { test: "vitest run", build: "vite build" }, dependencies: { react: "^18" } }),
    "frontend/src/App.tsx": "export const App = () => null;\n",
    "docs/readme.md": "# docs\n",
  });
  const r = scan(dir);
  const subs = Object.fromEntries(r.observed.subprojects.map((s) => [s.dir, s]));
  assert.deepStrictEqual(Object.keys(subs).sort(), ["backend", "frontend"]);
  assert.ok(subs.backend.manifests.includes("requirements.txt"));
  assert.strictEqual(subs.frontend.commands.test, "npm test");
  assert.strictEqual(subs.frontend.commands.build, "npm run build");
  assert.ok(!r.uncertainties.some((u) => /^No manifest found/.test(u)), "manifests exist, just not at the root");
  assert.ok(r.uncertainties.some((u) => /subfolders/i.test(u) && /backend/.test(u) && /frontend/.test(u)));
  assert.ok(r.inferred.some((i) => /FastAPI/.test(i.claim)), "frameworks are inferred from subproject manifests too");
  assert.ok(r.inferred.some((i) => /React/.test(i.claim)));
  assert.deepStrictEqual(r.observed.commands, {}, "root commands stay empty: nothing is promoted to the root");
  const cli2 = cli(["propose"], dir);
  assert.strictEqual(cli2.status, 0);
  const constitution = fs.readFileSync(path.join(dir, "docs", "proposed", "constitution.md"), "utf8");
  assert.match(constitution, /frontend: .*npm test/);
});

test("an empty directory is handled: nothing is invented and the gaps are listed", () => {
  const r = scan(tmp("sc-adopt-empty-"));
  assert.deepStrictEqual(r.observed.languages, []);
  assert.strictEqual(r.observed.git.isRepo, false);
  assert.deepStrictEqual(r.observed.commands, {});
  for (const gap of [/test command/i, /no (tests|test files)/i, /not a git repository|no git/i, /no manifest/i]) assert.ok(r.uncertainties.some((u) => gap.test(u)), `missing uncertainty ${gap}`);
});

test("existing agent docs, monorepos and contradictory tooling are flagged", () => {
  const dir = project({
    "CLAUDE.md": "# mine",
    "AGENTS.md": "# also mine",
    "package.json": JSON.stringify({ name: "mono", workspaces: ["packages/*"], scripts: {} }),
    "package-lock.json": "{}",
    "yarn.lock": "",
    "biome.json": "{}",
    ".eslintrc.json": "{}",
    "jest.config.js": "module.exports = {};",
    "vitest.config.ts": "export default {};",
  });
  const r = scan(dir);
  assert.ok(r.uncertainties.some((u) => /CLAUDE\.md|AGENTS\.md/.test(u) && /merge/i.test(u)));
  assert.ok(r.uncertainties.some((u) => /monorepo|workspaces/i.test(u)));
  assert.ok(r.conflicts.some((c) => /lockfile/i.test(c)));
  assert.ok(r.conflicts.some((c) => /eslint/i.test(c) && /biome/i.test(c)));
  assert.ok(r.conflicts.some((c) => /jest/i.test(c) && /vitest/i.test(c)));
});

test("scan is read-only and never reads secret files", () => {
  const dir = project({ ...NODE_TS, ".env": "STRIPE_SECRET=sk_live_SUPERSECRETVALUE\n", ".env.production": "TOKEN=abcSECRET\n" }, { git: true });
  const before = snapshot(dir);
  const r = scan(dir);
  const out = JSON.stringify(r);
  assert.doesNotMatch(out, /SUPERSECRETVALUE|abcSECRET/);
  assert.deepStrictEqual(r.observed.env.local.sort(), [".env", ".env.production"]);
  assert.deepStrictEqual(snapshot(dir), before, "scan must not change anything");
});

test("heavy folders are ignored and a very large tree is reported as truncated", () => {
  const files = { "package.json": "{}", "node_modules/pkg/index.js": "x", "dist/a.js": "x" };
  for (let i = 0; i < 120; i++) files[`src/f${i}.ts`] = "x";
  const dir = project(files);
  const r = scan(dir, { maxFiles: 50 });
  assert.strictEqual(r.truncated, true);
  assert.ok(r.uncertainties.some((u) => /truncated|partial/i.test(u)));
  const full = scan(dir);
  assert.strictEqual(full.observed.languages.find((l) => l.name === "TypeScript").files, 120, "node_modules and dist are not counted");
});

test("propose writes drafts only under docs/proposed, marks unknowns and never overwrites", () => {
  const dir = project({ ...NODE_TS, "CLAUDE.md": "# keep me", "AGENTS.md": "# keep me too" }, { git: true });
  const before = snapshot(dir);
  const r1 = cli(["propose"], dir);
  assert.strictEqual(r1.status, 0, r1.stderr);
  const written = snapshot(dir).filter((l) => !before.includes(l));
  assert.ok(written.length >= 3, written.join(","));
  for (const w of written) assert.match(w, /^docs[\\/](proposed|$)|^docs:dir$/, `unexpected write ${w}`);
  assert.strictEqual(fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8"), "# keep me");
  assert.strictEqual(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"), "# keep me too");
  for (const f of ["AGENTS.md", "constitution.md", "architecture.md", "README.md"]) assert.ok(fs.existsSync(path.join(dir, "docs", "proposed", f)), `missing ${f}`);

  const agents = fs.readFileSync(path.join(dir, "docs", "proposed", "AGENTS.md"), "utf8");
  assert.match(agents, /Test: `npm test`/);
  assert.match(agents, /Lint: `npm run lint`/);
  const arch = fs.readFileSync(path.join(dir, "docs", "proposed", "architecture.md"), "utf8");
  assert.match(arch, /observed/i);
  assert.match(arch, /inferred/i);

  fs.writeFileSync(path.join(dir, "docs", "proposed", "constitution.md"), "my edits");
  const r2 = cli(["propose"], dir);
  assert.strictEqual(r2.status, 0);
  assert.match(r2.stdout, /skipped.*constitution\.md/i);
  assert.strictEqual(fs.readFileSync(path.join(dir, "docs", "proposed", "constitution.md"), "utf8"), "my edits", "an existing draft is never overwritten");
});

test("propose never invents a command that was not observed", () => {
  const dir = project({ "app/main.py": "print(1)\n" });
  cli(["propose"], dir);
  const agents = fs.readFileSync(path.join(dir, "docs", "proposed", "AGENTS.md"), "utf8");
  assert.match(agents, /Test: `UNKNOWN/);
  assert.doesNotMatch(agents, /npm test|pytest|go test|cargo test/);
  const constitution = fs.readFileSync(path.join(dir, "docs", "proposed", "constitution.md"), "utf8");
  assert.match(constitution, /UNKNOWN/);
});

test("the CLI prints Observed, Inferred and Uncertain sections, and --json is the same data", () => {
  const dir = project(NODE_TS, { git: true });
  const text = cli(["scan"], dir).stdout;
  for (const h of ["Observed", "Inferred", "Uncertain"]) assert.match(text, new RegExp(`^${h}`, "m"));
  const j = JSON.parse(cli(["scan", "--json"], dir).stdout);
  assert.ok(j.observed && j.inferred && j.uncertainties && j.conflicts);
  assert.strictEqual(cli(["scan", path.join(dir, "nope")], dir).status, 1);
});

test("the adopt command and skill exist, say read-only and docs/proposed, and the rest of the docs point to them", () => {
  const cmd = fs.readFileSync(path.join(root, "commands", "adopt.md"), "utf8");
  assert.match(cmd, /adopt\.js" scan/);
  assert.match(cmd, /docs\/proposed/);
  const skill = fs.readFileSync(path.join(root, "skills", "adopt", "SKILL.md"), "utf8");
  assert.match(skill, /^name: adopt$/m);
  for (const part of ["read-only", "docs/proposed", "observed", "inferred", "never overwrite", "one question"]) assert.match(skill, new RegExp(part, "i"), `skill misses ${part}`);
  assert.match(fs.readFileSync(path.join(root, "skills", "project-start", "SKILL.md"), "utf8"), /\/swiftcraft:adopt/);
  assert.match(fs.readFileSync(path.join(root, "README.md"), "utf8"), /\/swiftcraft:adopt/);
});
