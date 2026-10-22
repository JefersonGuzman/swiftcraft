const test = require("node:test");
const assert = require("node:assert");
const { execFile, spawnSync } = require("node:child_process");
const { promisify } = require("node:util");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const run = promisify(execFile);
const root = path.join(__dirname, "..");
const { compareVersions, changelogBetween, changelogSection } = require("../scripts/lib/version.js");

const CHANGELOG = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "### Added",
  "- Not released yet.",
  "",
  "## [0.3.0] - 2026-11-01",
  "",
  "### Added",
  "- Update command.",
  "",
  "## [0.2.0] - 2026-10-22",
  "",
  "### Added",
  "- Stack templates.",
  "",
  "## [0.1.0]",
  "",
  "### Added",
  "- Initial.",
  "",
].join("\n");

test("compareVersions orders numeric semver and rejects garbage", () => {
  assert.strictEqual(compareVersions("0.2.0", "0.3.0"), -1);
  assert.strictEqual(compareVersions("1.0.0", "0.9.9"), 1);
  assert.strictEqual(compareVersions("0.10.0", "0.9.0"), 1);
  assert.strictEqual(compareVersions("1.2.3", "1.2.3"), 0);
  assert.throws(() => compareVersions("1.2", "1.2.3"), /version/i);
  assert.throws(() => compareVersions("a.b.c", "1.2.3"), /version/i);
});

test("changelogBetween returns only releases newer than installed up to latest", () => {
  const out = changelogBetween(CHANGELOG, "0.1.0", "0.3.0");
  assert.match(out, /\[0\.3\.0\]/);
  assert.match(out, /\[0\.2\.0\]/);
  assert.doesNotMatch(out, /\[0\.1\.0\]/);
  assert.doesNotMatch(out, /Not released yet/);
  assert.strictEqual(changelogBetween(CHANGELOG, "0.3.0", "0.3.0"), "");
});

test("changelogSection extracts one version's notes", () => {
  const s = changelogSection(CHANGELOG, "0.2.0");
  assert.match(s, /Stack templates/);
  assert.doesNotMatch(s, /Update command/);
  assert.strictEqual(changelogSection(CHANGELOG, "9.9.9"), "");
});

test("changelog-notes script prints a section and fails on unknown version", () => {
  const cl = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sc-cl-")), "CHANGELOG.md");
  fs.writeFileSync(cl, CHANGELOG);
  const ok = spawnSync("node", [path.join(root, "scripts", "changelog-notes.js"), "0.3.0", "--file", cl], { encoding: "utf8" });
  assert.strictEqual(ok.status, 0);
  assert.match(ok.stdout, /Update command/);
  const bad = spawnSync("node", [path.join(root, "scripts", "changelog-notes.js"), "9.9.9", "--file", cl], { encoding: "utf8" });
  assert.strictEqual(bad.status, 1);
});

// --- update-check against a local HTTP server -------------------------------------------------
function serve(latest) {
  const hits = { n: 0 };
  const server = http.createServer((req, res) => {
    hits.n++;
    if (req.url.endsWith("/.claude-plugin/plugin.json")) {
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ name: "swiftcraft", version: latest }));
    }
    if (req.url.endsWith("/CHANGELOG.md")) return res.end(CHANGELOG);
    res.statusCode = 404;
    res.end("nope");
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, hits, base: `http://127.0.0.1:${server.address().port}` })));
}
const installed = () => JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin", "plugin.json"), "utf8")).version;
const cacheDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "sc-cache-"));
const check = (args, env) =>
  run("node", [path.join(root, "scripts", "update-check.js"), ...args], { env: { ...process.env, ...env }, encoding: "utf8" }).catch((e) => e);

test("update-check --notice announces a newer version, then uses the cache", async () => {
  const { server, hits, base } = await serve("99.0.0");
  const env = { SWIFTCRAFT_UPDATE_BASE: base, SWIFTCRAFT_CACHE_DIR: cacheDir() };
  try {
    const first = await check(["--notice"], env);
    assert.match(first.stdout, /99\.0\.0/);
    assert.match(first.stdout, /\/swiftcraft:update/);
    const after = hits.n;
    const second = await check(["--notice"], env);
    assert.match(second.stdout, /99\.0\.0/);
    assert.strictEqual(hits.n, after, "second call must not hit the network (cache)");
  } finally {
    server.close();
  }
});

test("update-check --notice is silent when up to date, opted out, or the network fails", async () => {
  const { server, base } = await serve(installed());
  try {
    assert.strictEqual((await check(["--notice"], { SWIFTCRAFT_UPDATE_BASE: base, SWIFTCRAFT_CACHE_DIR: cacheDir() })).stdout, "");
    const newer = await serve("99.0.0");
    try {
      assert.strictEqual(
        (await check(["--notice"], { SWIFTCRAFT_UPDATE_BASE: newer.base, SWIFTCRAFT_CACHE_DIR: cacheDir(), SWIFTCRAFT_NO_UPDATE_CHECK: "1" })).stdout,
        ""
      );
    } finally {
      newer.server.close();
    }
  } finally {
    server.close();
  }
  const dead = await check(["--notice"], { SWIFTCRAFT_UPDATE_BASE: "http://127.0.0.1:9", SWIFTCRAFT_CACHE_DIR: cacheDir() });
  assert.strictEqual(dead.stdout, "");
  assert.ok(!dead.code, "must fail open (exit 0)");
});

test("update-check --verbose shows versions, changelog excerpt and the update commands", async () => {
  const { server, base } = await serve("99.0.0");
  try {
    const r = await check(["--verbose"], { SWIFTCRAFT_UPDATE_BASE: base, SWIFTCRAFT_CACHE_DIR: cacheDir() });
    assert.match(r.stdout, new RegExp(`installed: ${installed().replace(/\./g, "\\.")}`));
    assert.match(r.stdout, /latest: 99\.0\.0/);
    assert.match(r.stdout, /claude plugin marketplace update swiftcraft/);
    assert.match(r.stdout, /claude plugin update swiftcraft@swiftcraft/);
    assert.match(r.stdout, /[Rr]estart/);
  } finally {
    server.close();
  }
});

test("update-check prefers the latest GitHub release over a stale raw plugin.json, and uses its notes", async () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/releases/latest") {
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ tag_name: "swiftcraft--v99.1.0", body: "## [99.1.0]\n\n### Added\n- From the release body." }));
    }
    if (req.url.endsWith("/.claude-plugin/plugin.json")) return res.end(JSON.stringify({ version: installed() })); // stale CDN copy
    res.statusCode = 404;
    res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const r = await check(["--verbose"], { SWIFTCRAFT_UPDATE_API: `${base}/releases/latest`, SWIFTCRAFT_UPDATE_BASE: base, SWIFTCRAFT_CACHE_DIR: cacheDir() });
    assert.match(r.stdout, /latest: 99\.1\.0/);
    assert.match(r.stdout, /From the release body/);
    const n = await check(["--notice"], { SWIFTCRAFT_UPDATE_API: `${base}/releases/latest`, SWIFTCRAFT_UPDATE_BASE: base, SWIFTCRAFT_CACHE_DIR: cacheDir() });
    assert.match(n.stdout, /99\.1\.0/);
  } finally {
    server.close();
  }
});

test("update-check falls back to raw plugin.json when the release API fails", async () => {
  const { server, base } = await serve("99.2.0");
  try {
    const r = await check(["--verbose"], { SWIFTCRAFT_UPDATE_API: "http://127.0.0.1:9/releases/latest", SWIFTCRAFT_UPDATE_BASE: base, SWIFTCRAFT_CACHE_DIR: cacheDir() });
    assert.match(r.stdout, /latest: 99\.2\.0/);
  } finally {
    server.close();
  }
});

test("update-check --verbose reports up to date and reports network failure with exit 1", async () => {
  const { server, base } = await serve(installed());
  try {
    const r = await check(["--verbose"], { SWIFTCRAFT_UPDATE_BASE: base, SWIFTCRAFT_CACHE_DIR: cacheDir() });
    assert.match(r.stdout, /up to date/i);
  } finally {
    server.close();
  }
  const dead = await check(["--verbose"], { SWIFTCRAFT_UPDATE_BASE: "http://127.0.0.1:9", SWIFTCRAFT_CACHE_DIR: cacheDir() });
  assert.strictEqual(dead.code, 1);
  assert.match(dead.stderr, /could not/i);
});

test("manifests declare the repository; marketplace has a description; update command and notice hook exist", () => {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
  assert.match(read(".claude-plugin/plugin.json").repository, /^https:\/\/github\.com\/JefersonGuzman\/swiftcraft$/);
  assert.ok(read(".claude-plugin/marketplace.json").description.length > 20);
  assert.ok(fs.existsSync(path.join(root, "commands", "update.md")));
  assert.match(fs.readFileSync(path.join(root, "hooks", "hooks.json"), "utf8"), /update-check\.js\\" --notice/);
  assert.ok(fs.existsSync(path.join(root, ".github", "workflows", "release.yml")));
});
