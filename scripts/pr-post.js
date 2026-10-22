#!/usr/bin/env node
// Turn findings.json into a GitHub review (event COMMENT). DRY RUN unless --post is passed.
// Usage: node pr-post.js --dir <pr-scratch-dir> [--findings <file>] [--post]
// The dir comes from pr-fetch.js and must hold meta.json + diff.patch; findings default to <dir>/findings.json.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { buildReview } = require("./lib/review.js");

const args = process.argv.slice(2);
const val = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const dir = val("--dir");
if (!dir) {
  console.error("Usage: node pr-post.js --dir <pr-scratch-dir> [--findings <file>] [--post]");
  process.exit(1);
}

try {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  const diff = fs.readFileSync(path.join(dir, "diff.patch"), "utf8");
  const findings = JSON.parse(fs.readFileSync(val("--findings") || path.join(dir, "findings.json"), "utf8"));
  const m = String(meta.url || "").match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/);
  if (!m) throw new Error("meta.json has no valid GitHub PR url.");
  const [, repo, number] = m;

  const { payload, stats } = buildReview(findings, diff, meta.headRefOid);

  if (!args.includes("--post")) {
    console.log(`DRY RUN — nothing was posted.\nTarget: ${repo}#${number} (commit ${String(meta.headRefOid).slice(0, 7)})`);
    console.log(`Review event: COMMENT · inline: ${stats.inline} · in review body: ${stats.inBody} · total findings: ${stats.total}\n`);
    console.log("--- review body ---\n" + payload.body + "\n");
    payload.comments.forEach((c) => console.log(`--- ${c.path}:${c.line} ---\n${c.body}\n`));
    console.log("To publish, re-run with --post after the user confirms.");
    process.exit(0);
  }

  const out = execFileSync("gh", ["api", `repos/${repo}/pulls/${number}/reviews`, "--method", "POST", "--input", "-"], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
  const res = JSON.parse(out);
  console.log(`Posted review ${res.id || ""} on ${repo}#${number}: ${res.html_url || "(no url returned)"}`);
} catch (e) {
  console.error(`pr-post failed: ${(e.stderr || e.message || "").toString().trim().split("\n")[0]}`);
  process.exit(1);
}
