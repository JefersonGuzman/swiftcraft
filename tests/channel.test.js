const test = require("node:test");
const assert = require("node:assert");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { tmp } = require("./helpers.js");

const run = promisify(execFile);
const root = path.join(__dirname, "..");
const { compareVersions, bump, isPrerelease, changelogBetween } = require("../scripts/lib/version.js");
const { loadConfig } = require("../scripts/lib/config.js");

test("a prerelease sorts before its release and prereleases follow SemVer order", () => {
  const order = ["0.6.0-alpha", "0.6.0-alpha.1", "0.6.0-beta.1", "0.6.0-beta.2", "0.6.0-beta.10", "0.6.0-rc.1", "0.6.0", "0.6.1"];
  for (let i = 0; i < order.length - 1; i++) {
    assert.strictEqual(compareVersions(order[i], order[i + 1]), -1, `${order[i]} < ${order[i + 1]}`);
    assert.strictEqual(compareVersions(order[i + 1], order[i]), 1);
  }
  assert.strictEqual(compareVersions("1.0.0-beta.1", "1.0.0-beta.1"), 0);
  assert.strictEqual(isPrerelease("1.0.0-beta.1"), true);
  assert.strictEqual(isPrerelease("1.0.0"), false);
  assert.throws(() => compareVersions("1.0.0-", "1.0.0"), /version/i);
});

test("bump handles stable, beta and explicit versions", () => {
  assert.strictEqual(bump("0.5.0", "patch"), "0.5.1");
  assert.strictEqual(bump("0.5.0", "minor"), "0.6.0");
  assert.strictEqual(bump("0.5.0", "major"), "1.0.0");
  assert.strictEqual(bump("0.5.0", "beta"), "0.6.0-beta.1");
  assert.strictEqual(bump("0.6.0-beta.1", "beta"), "0.6.0-beta.2");
  assert.strictEqual(bump("0.6.0-beta.2", "minor"), "0.6.0", "graduating a prerelease publishes its stable version");
  assert.strictEqual(bump("0.6.0-beta.2", "patch"), "0.6.0");
  assert.strictEqual(bump("0.5.0", "0.7.0-rc.1"), "0.7.0-rc.1");
  assert.throws(() => bump("0.5.0", "nope"), /version/i);
});

test("changelog sections accept prerelease headings", () => {
  const cl = "## [Unreleased]\n\n## [0.6.0-beta.1] - 2026-11-01\n- b\n\n## [0.5.0] - 2026-10-01\n- a\n";
  assert.match(changelogBetween(cl, "0.5.0", "0.6.0-beta.1"), /0\.6\.0-beta\.1/);
});

// --- update-check channel ---------------------------------------------------------------------------------------
const RELEASES = [
  { tag_name: "swiftcraft--v99.0.0-beta.2", prerelease: true, draft: false, body: "beta notes" },
  { tag_name: "swiftcraft--v99.0.0-beta.1", prerelease: true, draft: false },
  { tag_name: "swiftcraft--v98.0.0", prerelease: false, draft: false, body: "stable notes" },
  { tag_name: "swiftcraft--v100.0.0", prerelease: false, draft: true },
];
async function serve() {
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url.startsWith("/releases")) return res.end(JSON.stringify(RELEASES));
    res.statusCode = 404;
    res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
const check = (args, env) => run("node", [path.join(root, "scripts", "update-check.js"), ...args], { env: { ...process.env, SWIFTCRAFT_CHANNEL: "", ...env }, encoding: "utf8" }).catch((e) => e);

test("the stable channel ignores prereleases and drafts, the beta channel includes prereleases but never drafts", async () => {
  const { server, base } = await serve();
  const env = { SWIFTCRAFT_UPDATE_API: `${base}/releases`, SWIFTCRAFT_UPDATE_BASE: base };
  try {
    const stable = await check(["--verbose"], { ...env, SWIFTCRAFT_CACHE_DIR: tmp("sc-ch-") });
    assert.match(stable.stdout, /latest: 98\.0\.0/);
    assert.doesNotMatch(stable.stdout, /beta/);
    const beta = await check(["--verbose"], { ...env, SWIFTCRAFT_CHANNEL: "beta", SWIFTCRAFT_CACHE_DIR: tmp("sc-ch-") });
    assert.match(beta.stdout, /latest: 99\.0\.0-beta\.2/);
    assert.match(beta.stdout, /beta notes/);
  } finally {
    server.close();
  }
});

test("the notice cache is per channel, so switching channel is not served a stale answer", async () => {
  const { server, base } = await serve();
  const cache = tmp("sc-ch-");
  const env = { SWIFTCRAFT_UPDATE_API: `${base}/releases`, SWIFTCRAFT_UPDATE_BASE: base, SWIFTCRAFT_CACHE_DIR: cache };
  try {
    assert.match((await check(["--notice"], env)).stdout, /98\.0\.0/);
    assert.match((await check(["--notice"], { ...env, SWIFTCRAFT_CHANNEL: "beta" })).stdout, /99\.0\.0-beta\.2/);
  } finally {
    server.close();
  }
});

test("the beta channel is a setting: default stable, project file, environment, and a typo is an error", () => {
  const dir = tmp("sc-ch-");
  assert.strictEqual(loadConfig(dir, {}).values.updates.channel, "stable");
  fs.writeFileSync(path.join(dir, "swiftcraft.config.json"), JSON.stringify({ updates: { channel: "beta" } }));
  const c = loadConfig(dir, {});
  assert.strictEqual(c.values.updates.channel, "beta");
  assert.strictEqual(c.sources["updates.channel"], "project");
  assert.strictEqual(loadConfig(dir, { SWIFTCRAFT_CHANNEL: "stable" }).values.updates.channel, "stable");
  fs.writeFileSync(path.join(dir, "swiftcraft.config.json"), JSON.stringify({ updates: { channel: "nightly" } }));
  assert.ok(loadConfig(dir, {}).errors.some((e) => /updates\.channel must be one of: stable, beta/.test(e)));
});

// --- release pipeline -------------------------------------------------------------------------------------------
test("the release workflow marks prereleases and publishes the archive, checksums and a provenance attestation", () => {
  const wf = fs.readFileSync(path.join(root, ".github", "workflows", "release.yml"), "utf8");
  assert.match(wf, /--prerelease/);
  assert.match(wf, /SHA256SUMS/);
  assert.match(wf, /sha256sum/);
  assert.match(wf, /actions\/attest-build-provenance@v\d+/);
  assert.match(wf, /id-token: write/);
  assert.match(wf, /attestations: write/);
  assert.match(wf, /git archive/);
  assert.match(wf, /swiftcraft--v\*/);
});

test("the docs say how to use the beta channel and how to verify a release, and what is not verified", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const security = fs.readFileSync(path.join(root, "SECURITY.md"), "utf8");
  for (const part of ["SWIFTCRAFT_CHANNEL=beta", "updates.channel"]) assert.match(readme, new RegExp(part.replace(".", "\\.")));
  for (const part of ["SHA256SUMS", "gh attestation verify", "not verified"]) assert.match(security, new RegExp(part, "i"), `SECURITY.md misses ${part}`);
});

test("release.js accepts beta and prerelease versions", () => {
  const src = fs.readFileSync(path.join(root, "scripts", "release.js"), "utf8");
  assert.match(src, /bump\(/);
  assert.match(src, /beta/);
});
