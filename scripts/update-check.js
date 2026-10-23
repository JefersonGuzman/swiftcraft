#!/usr/bin/env node
// Compare the installed swiftcraft version with the latest one published on GitHub.
//   --notice   SessionStart hook mode: at most one network check per 24 h, silent unless an update exists,
//              always exits 0. Opt out with SWIFTCRAFT_NO_UPDATE_CHECK=1 or updates.check in swiftcraft.config.json.
//   --verbose  /swiftcraft:update mode: always checks, shows the CHANGELOG entries you would get and the
//              commands to update. Exits 1 if GitHub cannot be reached.
// This script never updates anything by itself.
// Test overrides: SWIFTCRAFT_UPDATE_BASE (raw content base URL), SWIFTCRAFT_CACHE_DIR.
const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const { compareVersions, changelogBetween } = require("./lib/version.js");

const args = process.argv.slice(2);
const notice = args.includes("--notice");
const verbose = args.includes("--verbose");
const DAY = 24 * 60 * 60 * 1000;

if (notice && !require("./lib/config.js").loadConfig(process.cwd()).values.updates.check) process.exit(0);

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", ".claude-plugin", "plugin.json"), "utf8"));
const installed = manifest.version;
const repoMatch = String(manifest.repository || "").match(/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/);
const base = process.env.SWIFTCRAFT_UPDATE_BASE || (repoMatch ? `https://raw.githubusercontent.com/${repoMatch[1]}/main` : null);
// The latest GitHub release is the primary source: raw.githubusercontent.com is cached for minutes after a
// release and can still show the old version. When SWIFTCRAFT_UPDATE_BASE is set (tests) the API is skipped
// unless SWIFTCRAFT_UPDATE_API is also set.
const apiUrl =
  process.env.SWIFTCRAFT_UPDATE_API ||
  (!process.env.SWIFTCRAFT_UPDATE_BASE && repoMatch ? `https://api.github.com/repos/${repoMatch[1]}/releases/latest` : null);
let releaseNotes = "";
const cacheFile = path.join(process.env.SWIFTCRAFT_CACHE_DIR || os.tmpdir(), "swiftcraft-update-check.json");

function get(url, timeoutMs) {
  const lib = url.startsWith("https:") ? https : http;
  return new Promise((resolve, reject) => {
    const headers = { "user-agent": "swiftcraft-update-check", accept: "application/vnd.github+json, application/json, text/plain" };
    const req = lib.get(url, { timeout: timeoutMs, headers }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

const readCache = () => {
  try {
    return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  } catch {
    return null;
  }
};
const writeCache = (latest) => {
  try {
    fs.writeFileSync(cacheFile, JSON.stringify({ checkedAt: Date.now(), latest }));
  } catch {}
};

async function latestVersion(timeoutMs) {
  if (apiUrl) {
    try {
      const rel = JSON.parse(await get(apiUrl, timeoutMs));
      const m = String(rel.tag_name || "").match(/(\d+\.\d+\.\d+)$/);
      if (m) {
        if (typeof rel.body === "string") releaseNotes = rel.body.trim();
        return m[1];
      }
    } catch {
      // rate limit, no release yet or offline: fall back to the raw plugin.json below
    }
  }
  if (!base) throw new Error("no repository configured");
  const body = await get(`${base}/.claude-plugin/plugin.json`, timeoutMs);
  const v = JSON.parse(body).version;
  compareVersions(v, v); // validates the format
  return v;
}

async function main() {
  if (!base && !apiUrl) {
    if (notice) return;
    console.error("Could not determine the repository: add a GitHub `repository` URL to .claude-plugin/plugin.json.");
    process.exit(1);
  }

  if (notice) {
    let latest = null;
    const cache = readCache();
    if (cache && Date.now() - cache.checkedAt < DAY) latest = cache.latest;
    else {
      try {
        latest = await latestVersion(2500);
      } catch {
        latest = null;
      }
      writeCache(latest); // also caches failures, so an offline machine is not retried on every session
    }
    if (latest && compareVersions(latest, installed) > 0) {
      console.log(
        `swiftcraft ${latest} is available (installed ${installed}). Tell the user and suggest running /swiftcraft:update. ` +
          `Opt out of this check with SWIFTCRAFT_NO_UPDATE_CHECK=1.`
      );
    }
    return;
  }

  let latest;
  try {
    latest = await latestVersion(8000);
  } catch (e) {
    console.error(`Could not check for updates (${e.message}). Check your connection, or look at the releases on GitHub.`);
    process.exit(1);
  }
  writeCache(latest);
  console.log(`installed: ${installed}\nlatest: ${latest}`);
  const cmp = compareVersions(latest, installed);
  if (cmp === 0) return console.log("swiftcraft is up to date.");
  if (cmp < 0) return console.log("The installed version is newer than the published one (development build?). Nothing to update.");

  let notes = "";
  try {
    if (base) notes = changelogBetween(await get(`${base}/CHANGELOG.md`, 8000), installed, latest);
  } catch {
    // fall back to the release notes below
  }
  notes = notes || releaseNotes;
  console.log(notes ? `\nWhat you get:\n\n${notes}` : "\n(Could not load the CHANGELOG.)");
  console.log(
    `\nTo update, run in a terminal:\n  claude plugin marketplace update swiftcraft\n  claude plugin update swiftcraft@swiftcraft\n` +
      "Then restart Claude Code to apply it."
  );
}

main().catch((e) => {
  if (!notice) {
    console.error(`Could not check for updates (${e.message}).`);
    process.exit(1);
  }
});
