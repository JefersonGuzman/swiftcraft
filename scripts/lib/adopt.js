// Read-only analysis of an existing project, used by /swiftcraft:adopt.
//
// scan(dir) returns { observed, inferred, uncertainties, conflicts, truncated }:
//   observed       facts read from files and git (counts, manifests, scripts that exist, CI commands, folders)
//   inferred       conclusions drawn from the facts, each with evidence and a confidence (never presented as fact)
//   uncertainties  what could not be determined and should be confirmed with a person
//   conflicts      contradictory conventions found side by side
// It never writes anything, never reads the contents of .env files, and never invents a command that the project
// does not state. propose() (below) only creates NEW files under docs/proposed/.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const IGNORED = new Set([".git", "node_modules", "dist", "build", "out", "target", "vendor", ".venv", "venv", "env", "__pycache__", ".next", ".nuxt", ".cache", "coverage", ".idea", ".vscode", ".gradle", ".tox", ".mypy_cache", ".pytest_cache", "obj"]);
const LANG = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript", ".jsx": "JavaScript",
  ".py": "Python", ".go": "Go", ".rs": "Rust", ".java": "Java", ".kt": "Kotlin", ".cs": "C#", ".rb": "Ruby", ".php": "PHP", ".swift": "Swift",
  ".c": "C/C++", ".cpp": "C/C++", ".h": "C/C++", ".vue": "Vue", ".svelte": "Svelte",
};
const MANIFESTS = ["package.json", "pnpm-workspace.yaml", "tsconfig.json", "pyproject.toml", "requirements.txt", "setup.py", "Pipfile", "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts", "Gemfile", "composer.json", "Dockerfile", "docker-compose.yml", "Makefile"];
const LOCKFILES = { "package-lock.json": "npm", "yarn.lock": "yarn", "pnpm-lock.yaml": "pnpm", "bun.lockb": "bun", "bun.lock": "bun" };
const TOOLING = [
  [/^\.editorconfig$/, ".editorconfig"], [/^\.eslintrc(\..+)?$|^eslint\.config\.\w+$/, "eslint"], [/^\.prettierrc(\..+)?$|^prettier\.config\.\w+$/, "prettier"], [/^biome\.jsonc?$/, "biome"],
  [/^jest\.config\.\w+$/, "jest"], [/^vitest\.config\.\w+$/, "vitest"], [/^playwright\.config\.\w+$/, "playwright"], [/^cypress\.config\.\w+$/, "cypress"],
  [/^ruff\.toml$|^\.ruff\.toml$/, "ruff"], [/^\.flake8$/, "flake8"], [/^mypy\.ini$/, "mypy"], [/^pytest\.ini$/, "pytest"], [/^tox\.ini$/, "tox"],
  [/^\.golangci\.ya?ml$/, "golangci-lint"], [/^rustfmt\.toml$/, "rustfmt"], [/^\.pre-commit-config\.yaml$/, "pre-commit"], [/^commitlint\.config\.\w+$/, "commitlint"],
];
const LAYER_NAMES = new Set(["domain", "application", "infrastructure", "presentation", "adapters", "ports", "controllers", "services", "models", "repositories", "routes", "handlers", "features", "modules", "components", "pages", "views", "shared", "utils", "lib"]);
const CONVENTIONAL = /^(feat|fix|docs|chore|refactor|test|ci|build|perf|style|revert)(\([^)]+\))?!?: /;
const FRAMEWORKS = [
  ["express", "Express"], ["fastify", "Fastify"], ["@nestjs/core", "NestJS"], ["next", "Next.js"], ["react", "React"], ["vue", "Vue"], ["svelte", "Svelte"], ["vite", "Vite"], ["electron", "Electron"],
];
const PY_FRAMEWORKS = [["fastapi", "FastAPI"], ["django", "Django"], ["flask", "Flask"]];

const exists = (p) => fs.existsSync(p);

// Commands the project itself states (package.json scripts, Makefile targets). Nothing else is ever suggested.
function commandsFrom(scripts, pm, makefile) {
  const out = {};
  const run = (key) => (pm === "bun" ? (key === "test" ? "bun test" : `bun run ${key}`) : key === "test" ? `${pm} test` : `${pm} run ${key}`);
  for (const [key, names] of [["test", ["test"]], ["lint", ["lint"]], ["build", ["build"]], ["typecheck", ["typecheck", "type-check"]], ["format", ["format"]]]) {
    const found = names.find((n) => scripts[n]);
    if (found) out[key] = run(found);
    else if (makefile.includes(key)) out[key] = `make ${key}`;
  }
  return out;
}
function readSmall(p) {
  try {
    const st = fs.statSync(p);
    return st.size > 400 * 1024 ? "" : fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function walk(root, maxFiles) {
  const files = [];
  let truncated = false;
  const stack = [["", 0]];
  while (stack.length) {
    const [rel, depth] = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!IGNORED.has(e.name) && depth < 8) stack.push([r, depth + 1]);
      } else {
        if (files.length >= maxFiles) {
          truncated = true;
          return { files, truncated };
        }
        files.push(r);
      }
    }
  }
  return { files, truncated };
}

function git(dir, args) {
  const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8", timeout: 8000 });
  return r.status === 0 ? String(r.stdout).trim() : null;
}

function ciCommands(dir, files) {
  const out = [];
  for (const f of files.filter((x) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(x))) {
    const lines = readSmall(path.join(dir, f)).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\s*)(?:-\s*)?run:\s*(.*)$/);
      if (!m) continue;
      if (m[2] && !/^[|>][+-]?$/.test(m[2])) out.push(m[2].trim());
      else {
        const indent = m[1].length;
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j];
          if (!l.trim()) continue;
          if (l.search(/\S/) <= indent + (lines[i].includes("- run:") ? 2 : 0)) break;
          out.push(l.trim());
        }
      }
    }
  }
  return [...new Set(out)].slice(0, 40);
}

function scan(dir, opts = {}) {
  const root = path.resolve(dir);
  const maxFiles = opts.maxFiles || Number(process.env.SWIFTCRAFT_ADOPT_MAX_FILES) || 20000;
  const { files, truncated } = walk(root, maxFiles);
  const rootFiles = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
  const rootDirs = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && !IGNORED.has(e.name)).map((e) => e.name).sort();

  // languages
  const byLang = new Map();
  for (const f of files) {
    const l = LANG[path.extname(f).toLowerCase()];
    if (l) byLang.set(l, (byLang.get(l) || 0) + 1);
  }
  const languages = [...byLang].map(([name, n]) => ({ name, files: n })).sort((a, b) => b.files - a.files);

  // manifests, package manager, scripts
  const manifests = MANIFESTS.filter((m) => rootFiles.includes(m));
  const lockfiles = Object.keys(LOCKFILES).filter((l) => rootFiles.includes(l));
  const pms = [...new Set(lockfiles.map((l) => LOCKFILES[l]))];
  const packageManager = pms[0] || null;
  let packageJson = null;
  if (rootFiles.includes("package.json")) {
    try {
      const p = JSON.parse(readSmall(path.join(root, "package.json")));
      packageJson = { name: p.name || null, scripts: p.scripts || {}, workspaces: !!p.workspaces, deps: Object.keys({ ...(p.dependencies || {}), ...(p.devDependencies || {}) }) };
    } catch {
      packageJson = { name: null, scripts: {}, workspaces: false, deps: [], invalid: true };
    }
  }
  const makefile = rootFiles.includes("Makefile") ? [...readSmall(path.join(root, "Makefile")).matchAll(/^([A-Za-z0-9_.-]+):/gm)].map((m) => m[1]).filter((t) => !t.startsWith(".")) : [];
  const pyproject = rootFiles.includes("pyproject.toml") ? readSmall(path.join(root, "pyproject.toml")) : "";
  const requirements = rootFiles.includes("requirements.txt") ? readSmall(path.join(root, "requirements.txt")) : "";

  // commands: only what the project itself states
  const commands = commandsFrom(packageJson ? packageJson.scripts : {}, packageManager || "npm", makefile);

  // tests, docs, tooling, env
  const testFiles = files.filter((f) => /(^|\/)(test_[^/]+\.py|[^/]+_test\.(go|py)|[^/]+\.(test|spec)\.[jt]sx?|[^/]*Test\.java)$/.test(f)).length;
  const testDirs = rootDirs.filter((d) => /^(tests?|__tests__|spec|e2e)$/.test(d));
  const docs = {
    readme: rootFiles.some((f) => /^readme(\.\w+)?$/i.test(f)),
    claudeMd: rootFiles.includes("CLAUDE.md"),
    agentsMd: rootFiles.includes("AGENTS.md"),
    contributing: rootFiles.includes("CONTRIBUTING.md"),
    constitution: exists(path.join(root, "docs", "constitution.md")),
    architecture: exists(path.join(root, "docs", "architecture.md")),
    adr: exists(path.join(root, "docs", "adr")),
    odd: exists(path.join(root, "odd", "tasks")),
  };
  const tooling = [...new Set(rootFiles.flatMap((f) => TOOLING.filter(([re]) => re.test(f)).map(([, label]) => label)))];
  if (/\[tool\.ruff/.test(pyproject) && !tooling.includes("ruff")) tooling.push("ruff");
  if (/\[tool\.mypy/.test(pyproject) && !tooling.includes("mypy")) tooling.push("mypy");
  const env = { example: rootFiles.includes(".env.example"), local: rootFiles.filter((f) => /^\.env(\..+)?$/.test(f) && !/\.(example|sample|template)$/.test(f)).sort() };

  // manifests one level down (backend/, frontend/, packages…): reported per subproject, never promoted to the root
  const subprojects = [];
  for (const d of rootDirs) {
    let names = [];
    try {
      names = fs.readdirSync(path.join(root, d), { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
    } catch {
      continue;
    }
    const ms = MANIFESTS.filter((m) => !["Dockerfile", "docker-compose.yml", "Makefile"].includes(m) && names.includes(m));
    if (!ms.length) continue;
    const sub = { dir: d, manifests: ms, commands: {}, deps: [], text: "" };
    if (names.includes("package.json")) {
      try {
        const p = JSON.parse(readSmall(path.join(root, d, "package.json")));
        const subPm = Object.keys(LOCKFILES).filter((l) => names.includes(l)).map((l) => LOCKFILES[l])[0] || packageManager || "npm";
        sub.commands = commandsFrom(p.scripts || {}, subPm, []);
        sub.deps = Object.keys({ ...(p.dependencies || {}), ...(p.devDependencies || {}) });
      } catch {
        // an unreadable package.json is simply not reported
      }
    }
    for (const f of ["requirements.txt", "pyproject.toml"]) if (names.includes(f)) sub.text += `\n${readSmall(path.join(root, d, f))}`;
    subprojects.push(sub);
  }

  // structure
  const layerDirs = new Set();
  for (const f of files) for (const seg of f.split("/").slice(0, -1)) if (LAYER_NAMES.has(seg)) layerDirs.add(seg);
  const srcRoot = ["src", "app", "lib"].find((d) => rootDirs.includes(d));
  const srcChildren = srcRoot ? fs.readdirSync(path.join(root, srcRoot), { withFileTypes: true }).filter((e) => e.isDirectory() && !IGNORED.has(e.name)).map((e) => e.name).sort() : [];

  // git
  const isRepo = git(root, ["rev-parse", "--is-inside-work-tree"]) === "true";
  const subjects = isRepo ? (git(root, ["log", "-30", "--format=%s"]) || "").split("\n").filter(Boolean) : [];
  const gitInfo = {
    isRepo,
    branch: isRepo ? git(root, ["rev-parse", "--abbrev-ref", "HEAD"]) : null,
    commits: isRepo ? Number(git(root, ["rev-list", "--count", "HEAD"]) || 0) : 0,
    recentCommits: subjects.length,
    conventionalRatio: subjects.length ? subjects.filter((s) => CONVENTIONAL.test(s)).length / subjects.length : null,
  };

  const observed = {
    root, files: files.length, languages, manifests, lockfiles, packageManager, packageJson, makefileTargets: makefile, commands,
    ci: files.some((f) => /^\.github\/workflows\//.test(f)) ? [{ file: ".github/workflows", commands: ciCommands(root, files) }] : [],
    tests: { dirs: testDirs, files: testFiles }, docs, tooling, env,
    structure: { topLevel: rootDirs, srcChildren, layerDirs: [...layerDirs].sort() }, git: gitInfo,
    subprojects: subprojects.map(({ dir: d, manifests: ms, commands: cm }) => ({ dir: d, manifests: ms, commands: cm })),
  };

  // inferences: conclusions with evidence and a confidence, never presented as facts
  const inferred = [];
  if (languages.length) inferred.push({ claim: `Primary language: ${languages[0].name}`, evidence: [`${languages[0].files} of ${files.length} files`], confidence: "high" });
  const depSources = [...(packageJson ? [["package.json", packageJson.deps]] : []), ...subprojects.filter((s) => s.deps.length).map((s) => [`${s.dir}/package.json`, s.deps])];
  for (const [dep, label] of FRAMEWORKS) {
    const src = depSources.find(([, deps]) => deps.includes(dep));
    if (src) inferred.push({ claim: `Uses ${label}`, evidence: [`dependency "${dep}" in ${src[0]}`], confidence: "high" });
  }
  for (const t of ["vitest", "jest", "mocha"]) {
    const src = depSources.find(([, deps]) => deps.includes(t));
    if (src) inferred.push({ claim: `Tests use ${t}`, evidence: [`dependency "${t}" in ${src[0]}`], confidence: "medium" });
  }
  const pyText = `${pyproject}\n${requirements}\n${subprojects.map((s) => s.text).join("\n")}`.toLowerCase();
  for (const [dep, label] of PY_FRAMEWORKS) if (new RegExp(`(^|[\\s"'\\[,])${dep}([\\s"'=<>~\\]\\[,]|$)`, "m").test(pyText)) inferred.push({ claim: `Uses ${label}`, evidence: [`"${dep}" in pyproject.toml or requirements.txt`], confidence: "high" });
  if (/\[tool\.pytest|^\s*pytest\b/m.test(pyproject + "\n" + requirements) || rootFiles.includes("pytest.ini")) inferred.push({ claim: "Tests use pytest (run `pytest`, not stated by the project)", evidence: ["pytest configuration or dependency"], confidence: "medium" });
  if (rootFiles.includes("go.mod")) inferred.push({ claim: "Go project; `go test ./...` is the conventional test command (not stated by the project)", evidence: ["go.mod"], confidence: "medium" });
  if (rootFiles.includes("Cargo.toml")) inferred.push({ claim: "Rust project; `cargo test` is the conventional test command (not stated by the project)", evidence: ["Cargo.toml"], confidence: "medium" });
  const layers = new Set(observed.structure.layerDirs);
  if (layers.has("domain") && layers.has("application")) inferred.push({ claim: "Layered / Hexagonal-style structure (domain and application layers present)", evidence: [`folders: ${[...layers].filter((l) => ["domain", "application", "infrastructure", "presentation", "adapters", "ports"].includes(l)).join(", ")}`], confidence: "medium" });
  else if (["controllers", "services", "models", "repositories", "routes", "handlers"].filter((l) => layers.has(l)).length >= 2) inferred.push({ claim: "Layered by technical role (controllers / services / models style)", evidence: [`folders: ${[...layers].filter((l) => ["controllers", "services", "models", "repositories", "routes", "handlers"].includes(l)).join(", ")}`], confidence: "medium" });
  else if (layers.has("features") || layers.has("modules")) inferred.push({ claim: "Feature-based organisation", evidence: [`folder: ${layers.has("features") ? "features" : "modules"}`], confidence: "low" });
  if (gitInfo.conventionalRatio !== null) {
    const pct = Math.round(gitInfo.conventionalRatio * 100);
    inferred.push(
      gitInfo.conventionalRatio >= 0.7
        ? { claim: "Commits follow Conventional Commits", evidence: [`${pct}% of the last ${gitInfo.recentCommits} commits`], confidence: gitInfo.recentCommits >= 5 ? "high" : "medium" }
        : { claim: "No consistent commit convention", evidence: [`${pct}% of the last ${gitInfo.recentCommits} commits are conventional`], confidence: "low" }
    );
  }

  // uncertainties and conflicts
  const uncertainties = [];
  if (!manifests.length && !subprojects.length) uncertainties.push("No manifest found (package.json, pyproject.toml, go.mod, Cargo.toml, pom.xml…): the stack cannot be confirmed from files.");
  else if (!manifests.length) uncertainties.push(`Manifests found only in subfolders (${subprojects.map((s) => s.dir).join(", ")}): commands are listed per subproject; decide which one the harness commands should target.`);
  if (!commands.test) {
    const subTests = subprojects.filter((s) => s.commands.test).map((s) => `${s.dir}: ${s.commands.test}`);
    uncertainties.push(`No test command found at the root in package.json scripts or a Makefile: confirm how the tests are run.${subTests.length ? ` Subprojects state: ${subTests.join("; ")}.` : ""}`);
  }
  if (!testFiles) uncertainties.push("No test files found: there may be no automated tests.");
  if (!isRepo) uncertainties.push("Not a git repository (or git is not available): commit conventions and history are unknown.");
  if (docs.claudeMd || docs.agentsMd) uncertainties.push("CLAUDE.md and/or AGENTS.md already exist: merge the proposal into them by hand; adopt never overwrites.");
  if (packageJson && packageJson.workspaces) uncertainties.push("Monorepo (workspaces) detected: decide which package(s) the harness applies to.");
  if (packageJson && !packageManager) uncertainties.push("No lockfile found: the package manager is unknown (commands above assume npm).");
  if (languages.length > 1 && languages[1].files >= 0.2 * files.length) uncertainties.push(`Several languages in use (${languages.slice(0, 3).map((l) => l.name).join(", ")}): confirm which one the conventions should target.`);
  if (languages.length && !inferred.some((i) => /Layered|Feature-based/.test(i.claim))) uncertainties.push("Architecture style is unclear from folder names: describe it by hand before enforcing layer rules.");
  if (truncated) uncertainties.push(`The scan was truncated at ${maxFiles} files: counts are partial.`);

  const conflicts = [];
  if (pms.length > 1) conflicts.push(`More than one lockfile (${pms.join(", ")}): pick one package manager.`);
  if (tooling.includes("eslint") && tooling.includes("biome")) conflicts.push("Both eslint and biome are configured: pick one linter.");
  if (tooling.includes("prettier") && tooling.includes("biome")) conflicts.push("Both prettier and biome are configured: pick one formatter.");
  if (tooling.includes("jest") && tooling.includes("vitest")) conflicts.push("Both jest and vitest are configured: pick one test runner.");

  return { observed, inferred, uncertainties, conflicts, truncated };
}

// ---------------------------------------------------------------------------------------------------------------
const UNKNOWN = "UNKNOWN — not found in the project; confirm with the team";

function readmeLine(root) {
  for (const f of fs.readdirSync(root)) {
    if (!/^readme(\.\w+)?$/i.test(f)) continue;
    for (const l of readSmall(path.join(root, f)).split(/\r?\n/)) {
      const t = l.trim();
      if (t && !t.startsWith("#") && !t.startsWith("[") && !t.startsWith("<") && !t.startsWith("!")) return t.slice(0, 200);
    }
  }
  return null;
}

function drafts(root, r, templatesRoot) {
  const o = r.observed;
  const name = (o.packageJson && o.packageJson.name) || path.basename(root);
  const tpl = (...p) => fs.readFileSync(path.join(templatesRoot, ...p), "utf8");
  const langs = o.languages.slice(0, 3).map((l) => `${l.name} (${l.files} files)`).join(", ") || "no source files found";
  const claims = r.inferred.map((i) => `${i.claim} [${i.confidence}]`);

  const archLine = [
    `Observed top-level folders: ${o.structure.topLevel.join(", ") || "none"}.`,
    r.inferred.find((i) => /Layered|Feature-based/.test(i.claim)) ? `Inferred: ${r.inferred.find((i) => /Layered|Feature-based/.test(i.claim)).claim}.` : "Architecture style: UNKNOWN — describe it by hand.",
    "See `docs/architecture.md`. New code follows the target direction there; existing code is not rewritten.",
  ].join(" ");

  const agents = tpl("project", "AGENTS.md")
    .replace(/\{\{PROJECT_NAME\}\}/g, name)
    .replace("{{TEST_CMD}}", o.commands.test || UNKNOWN)
    .replace("{{LINT_CMD}}", o.commands.lint || UNKNOWN)
    .replace("{{BUILD_CMD}}", o.commands.build || UNKNOWN)
    .replace(/Feature-first Hexagonal:[^\n]*/, archLine);

  const conventions = [
    o.packageManager ? `- Package manager (observed from the lockfile): ${o.packageManager}` : null,
    ...o.subprojects.map((s) => `- Subproject \`${s.dir}\` (observed): manifests ${s.manifests.join(", ")}${Object.keys(s.commands).length ? `; ${s.dir}: ${Object.entries(s.commands).map(([k, v]) => v).join(", ")}` : ""}`),
    o.git.conventionalRatio !== null ? `- Commits: ${Math.round(o.git.conventionalRatio * 100)}% of the last ${o.git.recentCommits} follow Conventional Commits (observed)` : null,
    o.tooling.length ? `- Tooling files present (observed): ${o.tooling.join(", ")}` : null,
    o.ci.length && o.ci[0].commands.length ? `- CI runs (observed): ${o.ci[0].commands.slice(0, 8).join("; ")}` : null,
  ].filter(Boolean);
  const constitution =
    tpl("project", "docs", "constitution.md")
      .replace(/\{\{PROJECT_NAME\}\}/g, name)
      .replace("{{ONE_LINE_PRODUCT}}", readmeLine(root) ? `From the README (observed): ${readmeLine(root)}` : "UNKNOWN — ask the maintainers what the product does")
      .replace("{{STACK}}", `Observed: ${langs}${o.manifests.length ? `; manifests: ${o.manifests.join(", ")}` : ""}.\nInferred: ${claims.join("; ") || "nothing"}.`) +
    `\n## Existing conventions (observed, keep them)\n\n${conventions.join("\n") || "- none found"}\n\n## Open questions\n\n${r.uncertainties.map((u) => `- ${u}`).join("\n") || "- none"}\n`;

  const tree = (o.structure.srcChildren.length ? `- \`${["src", "app", "lib"].find((d) => o.structure.topLevel.includes(d))}/\`: ${o.structure.srcChildren.join(", ")}\n` : "") + `- top level: ${o.structure.topLevel.join(", ") || "(no folders)"}`;
  const architecture = [
    `# Architecture — ${name} (PROPOSAL)`,
    "",
    "Generated by `/swiftcraft:adopt`. This is a draft to review and edit; nothing here changes the code.",
    "",
    "## Observed",
    "",
    tree,
    `- layer-like folders found: ${o.structure.layerDirs.join(", ") || "none"}`,
    "",
    "## Inferred (verify before relying on it)",
    "",
    ...(r.inferred.map((i) => `- [${i.confidence}] ${i.claim} — evidence: ${i.evidence.join("; ")}`).concat(r.inferred.length ? [] : ["- nothing could be inferred"])),
    "",
    "## Uncertain",
    "",
    ...(r.uncertainties.map((u) => `- ${u}`).concat(r.conflicts.map((c) => `- CONFLICT: ${c}`))),
    "",
    "## Target direction (proposal, not a rewrite)",
    "",
    "- Existing code stays as it is; restructure a part only when you are already changing it.",
    "- New features: feature-first layout with `domain` (no framework or I/O imports), `application`, `infrastructure`, `presentation`; dependencies point inward only. The `arch-lint` hook checks this for folders named `domain/` and `application/`.",
    "- Work with `/swiftcraft:odd`: small changes go straight to a test, large ones get `odd/tasks/<feature>.md`.",
    "",
  ].join("\n");

  const readme = [
    "# Proposed harness documents",
    "",
    "Created by `/swiftcraft:adopt`. These are drafts: **review and edit them**, then adopt them yourself:",
    "",
    "- `constitution.md` → copy to `docs/constitution.md`",
    "- `architecture.md` → copy to `docs/architecture.md`",
    "- `AGENTS.md` → merge into your `AGENTS.md` (and reference it from `CLAUDE.md`); existing files are never overwritten by adopt",
    "",
    "Every `UNKNOWN` is something the project did not state: fill it in, do not guess. Delete this folder when you are done.",
    "",
  ].join("\n");

  return { "AGENTS.md": agents, "constitution.md": constitution, "architecture.md": architecture, "README.md": readme };
}

function propose(dir, templatesRoot, result) {
  const root = path.resolve(dir);
  const r = result || scan(root);
  const outDir = path.join(root, "docs", "proposed");
  const written = [];
  const skipped = [];
  const content = drafts(root, r, templatesRoot);
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, text] of Object.entries(content)) {
    const p = path.join(outDir, name);
    if (exists(p)) {
      skipped.push(`docs/proposed/${name}`);
      continue;
    }
    fs.writeFileSync(p, text);
    written.push(`docs/proposed/${name}`);
  }
  return { written, skipped };
}

module.exports = { scan, propose, UNKNOWN };
