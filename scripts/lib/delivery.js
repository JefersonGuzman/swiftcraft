// Delivery helpers: turn a working tree into reviewable commits and a traceable pull request description.
// Everything here only READS the repository (status, diff, log, rev-parse...). Creating commits, pushing, opening or
// merging pull requests is done by the user's confirmed commands, never by these scripts.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { assess, itemsFor, isTest, isDoc, isCode, isGenerated } = require("./risk.js");
const { SECRET_PATTERNS, redact } = require("./review.js");
const { findActiveDoc, nextStep, parseFeatureDoc } = require("./odd.js");

const ADVISORY_LINES = 400;
const BRANCH_RE = /^(feat|fix|docs|chore|release|refactor|test|ci|build|perf)\/[a-z0-9][a-z0-9._-]*$/;
const SUBJECT_RE = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9._/-]+\))?!?: \S.*$/;

function git(args, cwd) {
  const r = spawnSync("git", ["-c", "core.quotepath=false", ...args], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout || "", err: r.stderr || "" };
}

function repoRoot(cwd) {
  const r = git(["rev-parse", "--show-toplevel"], cwd);
  return r.ok ? r.out.trim() : null;
}

function countLines(file) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > 2 * 1024 * 1024) return 0;
    const text = fs.readFileSync(file, "utf8");
    return text ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0;
  } catch {
    return 0;
  }
}

// [{ path, added, removed, untracked }] for the working tree against HEAD (staged, unstaged and untracked).
function workingChanges(root) {
  const status = git(["status", "--porcelain", "-uall", "-z"], root).out.split("\0").filter(Boolean);
  const entries = [];
  for (let i = 0; i < status.length; i++) {
    const code = status[i].slice(0, 2);
    const file = status[i].slice(3);
    if (/[RC]/.test(code)) i++;
    entries.push({ code, path: file.replace(/\\/g, "/") });
  }
  const hasHead = git(["rev-parse", "--verify", "-q", "HEAD"], root).ok;
  const stats = new Map();
  const numstat = git(hasHead ? ["diff", "HEAD", "--numstat", "--no-renames"] : ["diff", "--cached", "--numstat", "--no-renames"], root).out;
  for (const line of numstat.split("\n")) {
    const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (m) stats.set(m[3], { added: m[1] === "-" ? 0 : +m[1], removed: m[2] === "-" ? 0 : +m[2] });
  }
  return entries.map((e) => {
    const s = stats.get(e.path);
    if (s) return { path: e.path, ...s, untracked: false };
    const untracked = e.code === "??";
    return { path: e.path, added: untracked ? countLines(path.join(root, e.path)) : 0, removed: 0, untracked };
  });
}

function findSecrets(root, files) {
  const res = SECRET_PATTERNS.map((re) => new RegExp(re.source, re.flags.replace("g", "")));
  const hits = [];
  for (const f of files) {
    if (isGenerated(f.path)) continue;
    try {
      const abs = path.join(root, f.path);
      const st = fs.statSync(abs);
      if (!st.isFile() || st.size > 1024 * 1024) continue;
      const text = fs.readFileSync(abs, "utf8");
      if (res.some((re) => re.test(text))) hits.push(f.path);
    } catch {}
  }
  return hits;
}

const dirOf = (p) => path.posix.dirname(p);
const stemOf = (p) => path.posix.basename(p).replace(/\.[^.]+$/, "").replace(/\.(test|spec)$/, "").replace(/_test$/, "").replace(/^test_/, "");
const sensitive = (p) => !isDoc(p) && !isTest(p) && itemsFor(p).some((i) => i.n !== 6);

function typeFor(key, files, branchType) {
  if (key === "docs") return "docs";
  if (key === "tests") return "test";
  if (key === "config") return "chore";
  if (files.some((f) => /(^|\/)\.github\/workflows\//.test(f.path))) return "ci";
  if (files.some((f) => /(^|\/)(package\.json|Dockerfile|docker-compose[^/]*|Makefile|go\.mod|Cargo\.toml|pyproject\.toml|requirements[^/]*\.txt|pom\.xml|build\.gradle)$/.test(f.path))) return "build";
  return branchType;
}

function buildUnits(files, branchType) {
  const groups = new Map();
  const put = (key, f) => {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  };
  const loneTests = [];
  const codeStems = new Map();
  for (const f of files) {
    if (isTest(f.path)) continue;
    if (isDoc(f.path)) put("docs", f);
    else if (sensitive(f.path)) put(`risk:${dirOf(f.path)}`, f);
    else if (isCode(f.path)) {
      put(`code:${dirOf(f.path)}`, f);
      codeStems.set(stemOf(f.path), `code:${dirOf(f.path)}`);
    } else put("config", f);
  }
  for (const f of files) {
    if (!isTest(f.path)) continue;
    const key = codeStems.get(stemOf(f.path));
    if (key) put(key, f);
    else loneTests.push(f);
  }
  const codeKeys = [...groups.keys()].filter((k) => k.startsWith("code:") || k.startsWith("risk:"));
  if (loneTests.length) {
    if (codeKeys.length === 1) loneTests.forEach((f) => put(codeKeys[0], f));
    else loneTests.forEach((f) => put("tests", f));
  }
  return [...groups.entries()].map(([key, fs_]) => ({
    name: key.includes(":") ? key.split(":")[1] : key,
    files: fs_.map((f) => f.path),
    authoredLines: fs_.reduce((n, f) => n + f.added + f.removed, 0),
    suggestedType: typeFor(key, fs_, branchType),
    risk: assess(fs_),
  }));
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function branchInfo(root, units, feature) {
  const name = git(["rev-parse", "--abbrev-ref", "HEAD"], root).out.trim() || "HEAD";
  const onDefault = name === "main" || name === "master";
  const problems = [];
  if (!onDefault && !BRANCH_RE.test(name)) problems.push("Branch names should look like feat|fix|docs|chore/short-name (lowercase, hyphens).");
  const only = (t) => units.length > 0 && units.every((u) => u.suggestedType === t);
  const type = only("docs") ? "docs" : units.every((u) => ["chore", "build", "ci", "test"].includes(u.suggestedType)) && units.length ? "chore" : "feat";
  const base = feature ? path.posix.basename(feature.file, ".md") : (units.find((u) => u.suggestedType === "feat") || units[0] || { name: "changes" }).name.split("/").pop();
  return { name, onDefault, problems, suggested: `${type}/${slug(base) || "changes"}` };
}

function plan(cwd) {
  const root = repoRoot(cwd);
  if (!root) return { error: "Not a git repository: run this from inside the project." };
  const changes = workingChanges(root);
  const authored = changes.filter((c) => !isGenerated(c.path));
  const generated = changes.filter((c) => isGenerated(c.path)).map((c) => c.path);
  const active = findActiveDoc(root);
  let feature = null;
  if (active) {
    const text = fs.readFileSync(active.file, "utf8");
    const step = nextStep(text);
    feature = { file: active.rel, state: step.state, action: step.action, tasks: parseFeatureDoc(text).tasks.map((t) => ({ id: t.id, done: t.done, outcome: t.outcome, commit: t.commit })) };
  }
  const branchType = /^fix\//.test(git(["rev-parse", "--abbrev-ref", "HEAD"], root).out.trim()) ? "fix" : "feat";
  const units = buildUnits(authored, branchType);
  const totalAuthoredLines = authored.reduce((n, c) => n + c.added + c.removed, 0);
  return {
    root,
    branch: branchInfo(root, units, feature),
    feature,
    files: changes.length,
    totalAuthoredLines,
    over400: totalAuthoredLines > ADVISORY_LINES,
    units,
    generated,
    highRiskFiles: changes.filter((c) => !isDoc(c.path) && itemsFor(c.path).some((i) => i.n !== 6)).map((c) => c.path),
    secrets: findSecrets(root, changes),
  };
}

function formatPlan(p) {
  const out = ["swiftcraft delivery plan (read-only: nothing is staged, committed or pushed)", ""];
  out.push(`Branch: ${p.branch.name}${p.branch.onDefault ? " (default branch)" : ""}`);
  if (p.branch.onDefault && p.files) out.push(`  Create a branch first (suggested: ${p.branch.suggested}); do not commit on ${p.branch.name}.`);
  for (const pr of p.branch.problems) out.push(`  ! ${pr}`);
  if (p.feature) {
    out.push(`Feature: ${p.feature.file} — state ${p.feature.state}; next: ${p.feature.action}`);
    for (const t of p.feature.tasks) out.push(`  ${t.done ? "[x]" : "[ ]"} ${t.id} ${t.outcome}${t.commit ? ` (commit ${t.commit})` : ""}`);
  }
  if (!p.files) {
    out.push("", "Nothing to commit: the working tree is clean.");
    return out.join("\n");
  }
  out.push("", `Changes: ${p.files} file(s), ${p.totalAuthoredLines} authored line(s) (lockfiles and generated files not counted)`);
  if (p.over400) out.push(`  About ${ADVISORY_LINES} authored lines is advisory, not a cap: split only where it keeps each commit easy to review.`);
  out.push("", "Suggested commits (each one a reviewable unit; a test travels with the code it covers):");
  p.units.forEach((u, i) => {
    out.push(`  ${i + 1}. ${u.suggestedType} — ${u.name} (${u.files.length} file(s), ${u.authoredLines} line(s)) risk: ${u.risk.tier}${u.risk.items.length ? ` [${u.risk.items.map((x) => `item ${x.n}: ${x.why}`).join("; ")}]` : ""}`);
    for (const f of u.files) out.push(`       ${f}`);
  });
  if (p.generated.length) out.push("", `Generated (commit together with the manifest that produced them): ${p.generated.join(", ")}`);
  if (p.highRiskFiles.length) out.push("", `Sensitive files: ${p.highRiskFiles.join(", ")}`, "  Give each sensitive area its own commit and run /swiftcraft:review before committing it.");
  if (p.secrets.length) out.push("", `Possible secret in: ${p.secrets.join(", ")} — the value is not shown. Remove it and rotate it if it was real, before any commit.`);
  out.push("", "Next: commit unit by unit with /swiftcraft:commit. Push, pull request and merge stay your decision.");
  return redact(out.join("\n"));
}

// Conventional Commits, and no AI attribution or Co-Authored-By trailers. Returns a list of problems.
function checkMessage(message) {
  const text = String(message || "").replace(/\r/g, "").trim();
  if (!text) return ["The commit message is empty."];
  const problems = [];
  const subject = text.split("\n")[0];
  if (!SUBJECT_RE.test(subject)) problems.push("The subject must follow Conventional Commits: type(scope): summary (feat, fix, docs, refactor, test, build, ci, chore, perf, style, revert).");
  if (subject.length > 72) problems.push(`The subject is ${subject.length} characters; keep it at 72 or fewer.`);
  if (/\.\s*$/.test(subject)) problems.push("The subject must not end with a period.");
  if (/^\s*co-authored-by\s*:/im.test(text) || /generated (with|by)\b[^\n]*(claude|\bai\b|copilot|chatgpt|gpt|gemini|cursor)/i.test(text) || /🤖/.test(text) || /noreply@anthropic\.com/i.test(text)) {
    problems.push("The message carries AI attribution or a Co-Authored-By line; this project does not use them. Remove it.");
  }
  return problems;
}

const tail = (s, n = 12) => redact(String(s).trim().split("\n").slice(-n).join("\n"));

// Run only the commands the project itself states (package.json scripts, Makefile targets). Never invents one.
function validate(root, commands) {
  const order = ["test", "lint", "typecheck", "build"].filter((k) => commands[k]);
  const results = [];
  for (const key of order) {
    const r = spawnSync(commands[key], { cwd: root, shell: true, encoding: "utf8", timeout: 10 * 60 * 1000, maxBuffer: 32 * 1024 * 1024 });
    const exitCode = r.status === null ? -1 : r.status;
    results.push({ command: commands[key], ok: exitCode === 0, exitCode, tail: tail((r.stdout || "") + "\n" + (r.stderr || "")) });
  }
  return { validated: results.length > 0, results };
}

function prBody({ cwd, base, validation }) {
  const root = repoRoot(cwd);
  if (!root) return { error: "Not a git repository." };
  let baseRef = base;
  if (!baseRef) baseRef = ["main", "master"].find((b) => git(["rev-parse", "--verify", "-q", b], root).ok);
  if (!baseRef || !git(["rev-parse", "--verify", "-q", baseRef], root).ok) return { error: `The base branch "${baseRef || "main"}" does not exist here; pass --base <branch>.` };
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], root).out.trim();
  const log = git(["log", `${baseRef}..HEAD`, "--reverse", "--format=%h%x1f%s%x1f%b%x1e"], root).out.split("\x1e").map((s) => s.trim()).filter(Boolean).map((s) => {
    const [hash, subject, body] = s.split("\x1f");
    return { hash, subject, body: body || "" };
  });
  if (!log.length) return { error: `No commits on ${branch} beyond ${baseRef}: there is nothing to open a pull request for.` };
  const files = [];
  for (const line of git(["diff", `${baseRef}...HEAD`, "--numstat", "--no-renames"], root).out.split("\n")) {
    const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (m) files.push({ path: m[3], added: m[1] === "-" ? 0 : +m[1], removed: m[2] === "-" ? 0 : +m[2] });
  }
  const risk = assess(files.filter((f) => !isGenerated(f.path) || itemsFor(f.path).length));
  const active = findActiveDoc(root);
  const tasks = active ? parseFeatureDoc(fs.readFileSync(active.file, "utf8")).tasks : [];

  const o = [`Branch: \`${branch}\` → \`${baseRef}\``, "", "## What and why", ""];
  for (const c of log) o.push(`- ${c.subject} (${c.hash})`);
  o.push("", "## Traceability", "");
  if (active && tasks.length) {
    o.push(`Feature document: \`${active.rel}\``, "");
    for (const t of tasks) o.push(`- ${t.id} (${t.specs.join(", ")}) ${t.outcome} — ${t.commit ? `commit ${t.commit}` : "no commit recorded"}${t.done ? "" : " — still open"}`);
  } else o.push("No feature document: this was a small change tracked by its commits above.");
  o.push("", "## Tests run", "");
  if (validation && validation.validated && validation.results.length) {
    for (const r of validation.results) o.push(`- ${r.ok ? "PASS" : "FAIL"} \`${r.command}\`${r.ok ? "" : ` (exit ${r.exitCode})`}`);
  } else o.push("Not verified: no validation results were provided, so nothing here claims the tests pass. Run `node scripts/delivery.js validate` first.");
  o.push("", "## Risk", "");
  const declared = log.flatMap((c) => c.body.split("\n").filter((l) => /^Risk:/i.test(l.trim())).map((l) => `- ${l.trim()} (${c.hash})`));
  o.push(...(declared.length ? declared : ["- No `Risk:` line was found in the commits."]));
  o.push(`- Computed from the changed paths: ${risk.tier}${risk.items.length ? ` — ${risk.items.map((i) => `item ${i.n} (${i.why})`).join("; ")}` : ""}`);
  o.push("", "## Checklist", "");
  let items = [];
  try {
    items = fs.readFileSync(path.join(root, ".github", "pull_request_template.md"), "utf8").split("\n").map((l) => l.trim()).filter((l) => /^- \[[ xX]\]/.test(l));
  } catch {}
  o.push(...(items.length ? items : ["- [ ] Tests cover the change", "- [ ] Docs and help text updated where behavior changed", "- [ ] No secrets or unrelated changes included"]));
  return { body: redact(o.join("\n")) };
}

module.exports = { plan, formatPlan, checkMessage, validate, prBody, ADVISORY_LINES, workingChanges, repoRoot };
