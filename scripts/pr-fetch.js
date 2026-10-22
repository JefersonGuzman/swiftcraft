#!/usr/bin/env node
// Fetch a pull request (metadata + diff) with the GitHub CLI into a scratch folder.
// Read-only. Usage: node pr-fetch.js <number|url> [--repo owner/name]
// Prints JSON: { dir, meta, diff, number, repo, headRefOid, bytes }
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parsePrRef } = require("./lib/pr-ref.js");

const MAX_DIFF_BYTES = 300 * 1024;
const { parseFetchArgs } = require("./lib/pr-args.js");
const { ref, repo: explicitRepo } = parseFetchArgs(process.argv.slice(2));

let parsed;
try {
  parsed = parsePrRef(ref);
  if (explicitRepo && !/^[\w.-]+\/[\w.-]+$/.test(explicitRepo)) throw new Error(`Invalid repo "${explicitRepo}".`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const repo = explicitRepo || parsed.repo;
const gh = (a) => execFileSync("gh", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const scope = repo ? ["--repo", repo] : [];

try {
  const fields = "number,title,body,author,baseRefName,headRefName,headRefOid,url,changedFiles,additions,deletions,isDraft,files";
  const meta = JSON.parse(gh(["pr", "view", String(parsed.number), ...scope, "--json", fields]));
  const diff = gh(["pr", "diff", String(parsed.number), ...scope]);
  const bytes = Buffer.byteLength(diff);
  if (bytes > MAX_DIFF_BYTES) {
    console.error(`Diff is ${Math.round(bytes / 1024)} KB (limit ${MAX_DIFF_BYTES / 1024} KB). Review it in parts or ask for a smaller PR.`);
    process.exit(2);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `swiftcraft-pr-${parsed.number}-`));
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(dir, "diff.patch"), diff);
  console.log(JSON.stringify({ dir, meta: path.join(dir, "meta.json"), diff: path.join(dir, "diff.patch"), number: meta.number, repo: repo || null, headRefOid: meta.headRefOid, bytes }, null, 2));
} catch (e) {
  console.error(`gh failed: ${(e.stderr || e.message || "").toString().trim().split("\n")[0]}`);
  console.error("Is the GitHub CLI installed and authenticated? Try: gh auth status");
  process.exit(1);
}
