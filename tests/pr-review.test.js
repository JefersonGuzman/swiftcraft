const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const { parseDiff } = require("../scripts/lib/diff.js");
const { buildReview, redact, MAX_INLINE } = require("../scripts/lib/review.js");
const { parsePrRef } = require("../scripts/lib/pr-ref.js");

const DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 111..222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,3 +1,4 @@",
  " line1",
  "-old2",
  "+new2",
  "+new3",
  " line3",
  "diff --git a/docs/new.md b/docs/new.md",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/docs/new.md",
  "@@ -0,0 +1,2 @@",
  "+hello",
  "+world",
  "diff --git a/gone.ts b/gone.ts",
  "deleted file mode 100644",
  "--- a/gone.ts",
  "+++ /dev/null",
  "@@ -1,1 +0,0 @@",
  "-bye",
].join("\n");

test("parseDiff maps right-side line numbers per file", () => {
  const d = parseDiff(DIFF);
  assert.deepStrictEqual([...d["src/a.ts"]].sort((a, b) => a - b), [1, 2, 3, 4]);
  assert.deepStrictEqual([...d["docs/new.md"]].sort((a, b) => a - b), [1, 2]);
  assert.strictEqual(d["gone.ts"], undefined);
});

test("parsePrRef accepts numbers and github URLs, rejects anything else", () => {
  assert.deepStrictEqual(parsePrRef("42"), { number: 42, repo: null });
  assert.deepStrictEqual(parsePrRef("https://github.com/acme/shop/pull/7"), { number: 7, repo: "acme/shop" });
  for (const bad of ["", "abc", "42; rm -rf /", "https://evil.com/acme/shop/pull/7", "-1", "0"]) {
    assert.throws(() => parsePrRef(bad), /PR/i, `should reject ${bad}`);
  }
});

test("parseFetchArgs finds the PR ref with or without --repo, in any order", () => {
  const { parseFetchArgs } = require("../scripts/lib/pr-args.js");
  assert.deepStrictEqual(parseFetchArgs(["42"]), { ref: "42", repo: null });
  assert.deepStrictEqual(parseFetchArgs(["--repo", "a/b", "42"]), { ref: "42", repo: "a/b" });
  assert.deepStrictEqual(parseFetchArgs(["42", "--repo", "a/b"]), { ref: "42", repo: "a/b" });
  assert.deepStrictEqual(parseFetchArgs(["https://github.com/a/b/pull/3"]), { ref: "https://github.com/a/b/pull/3", repo: null });
  assert.deepStrictEqual(parseFetchArgs([]), { ref: undefined, repo: null });
});

test("pr-fetch with a valid bare number gets past argument parsing (fails only at gh)", () => {
  const r = spawnSync("node", [path.join(root, "scripts", "pr-fetch.js"), "42"], {
    encoding: "utf8",
    env: { ...process.env, PATH: path.dirname(process.execPath) }, // node only: gh is not found
  });
  assert.notStrictEqual(r.status, 0);
  assert.doesNotMatch(r.stderr, /Invalid PR reference/);
  assert.match(r.stderr, /gh failed/);
});

test("redact removes token-like secrets", () => {
  assert.match(redact("key ghp_abcdefghijklmnopqrstuvwxyz0123456789 end"), /\[redacted\]/);
  assert.match(redact("AKIAABCDEFGHIJKLMNOP"), /\[redacted\]/);
  assert.strictEqual(redact("plain text"), "plain text");
});

const findings = (extra = {}) => ({
  summary: "Looks mostly fine.",
  verdict: "fix first",
  findings: [
    { path: "src/a.ts", line: 3, severity: "blocker", title: "Null deref", body: "x may be null." },
    { path: "src/a.ts", line: 99, severity: "should", title: "Off-diff", body: "Not in the diff." },
    { path: "docs/new.md", line: 1, severity: "nit", title: "Typo", body: "wrold" },
  ],
  ...extra,
});

test("buildReview anchors in-diff findings inline and moves the rest to the body", () => {
  const r = buildReview(findings(), DIFF, "abc123");
  assert.strictEqual(r.payload.event, "COMMENT");
  assert.strictEqual(r.payload.commit_id, "abc123");
  assert.strictEqual(r.payload.comments.length, 2);
  assert.deepStrictEqual(
    r.payload.comments.map((c) => [c.path, c.line, c.side]),
    [
      ["src/a.ts", 3, "RIGHT"],
      ["docs/new.md", 1, "RIGHT"],
    ]
  );
  assert.match(r.payload.body, /Off-diff/);
  assert.match(r.payload.body, /fix first/);
  assert.strictEqual(r.stats.inline, 2);
  assert.strictEqual(r.stats.inBody, 1);
});

test("buildReview orders by severity and never emits approve/request-changes", () => {
  const r = buildReview(findings(), DIFF, "abc123");
  assert.strictEqual(r.payload.comments[0].body.startsWith("**Blocker**"), true);
  assert.ok(!/APPROVE|REQUEST_CHANGES/.test(JSON.stringify(r.payload)));
});

test("buildReview rejects malformed findings", () => {
  assert.throws(() => buildReview({ findings: [] }, DIFF, "x"), /summary/);
  assert.throws(() => buildReview({ summary: "s", findings: [{ path: "a", line: 1, severity: "boom", title: "t", body: "b" }] }, DIFF, "x"), /severity/);
  assert.throws(() => buildReview({ summary: "s", findings: [{ path: "a", line: "1", severity: "nit", title: "t", body: "b" }] }, DIFF, "x"), /line/);
  assert.throws(() => buildReview(findings(), DIFF, ""), /commit/);
});

test("buildReview caps inline comments and overflows to the body; redacts secrets", () => {
  const many = Array.from({ length: MAX_INLINE + 5 }, (_, i) => ({
    path: "src/a.ts", line: 1 + (i % 4), severity: "nit", title: `n${i}`, body: "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
  }));
  const r = buildReview({ summary: "s", verdict: "ready", findings: many }, DIFF, "abc");
  assert.strictEqual(r.payload.comments.length, MAX_INLINE);
  assert.strictEqual(r.stats.inBody, 5);
  assert.ok(!/ghp_/.test(JSON.stringify(r.payload)));
});

test("pr-post is a dry run by default and needs no network", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-pr-"));
  fs.writeFileSync(path.join(dir, "diff.patch"), DIFF);
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ number: 7, url: "https://github.com/acme/shop/pull/7", headRefOid: "abc123" }));
  fs.writeFileSync(path.join(dir, "findings.json"), JSON.stringify(findings()));
  const r = spawnSync("node", [path.join(root, "scripts", "pr-post.js"), "--dir", dir], { encoding: "utf8" });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /DRY RUN/);
  assert.match(r.stdout, /acme\/shop/);
  assert.match(r.stdout, /inline: 2/);
});

test("pr-fetch rejects a malformed PR reference before touching gh", () => {
  const r = spawnSync("node", [path.join(root, "scripts", "pr-fetch.js"), "42; calc"], { encoding: "utf8" });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /PR/i);
});

test("pr-review pieces exist and the agent is read-only", () => {
  const agent = fs.readFileSync(path.join(root, "agents", "pr-reviewer.md"), "utf8");
  assert.match(agent, /^tools: Read, Glob, Grep\s*$/m);
  assert.ok(!/Bash|Write|Edit/.test(agent.split("---")[1]));
  assert.ok(fs.existsSync(path.join(root, "skills", "pr-review", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(root, "commands", "pr-review.md")));
});
