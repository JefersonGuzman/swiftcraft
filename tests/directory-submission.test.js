const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");
const manifest = JSON.parse(read(".claude-plugin", "plugin.json"));

test("the manifest carries the metadata the directory listing reads", () => {
  for (const k of ["name", "version", "description", "license", "homepage", "repository"]) assert.ok(manifest[k], `plugin.json misses ${k}`);
  assert.ok(manifest.author && manifest.author.name, "author.name");
  assert.match(manifest.name, /^[a-z0-9][a-z0-9-]{0,63}$/, "a kebab-case, lowercase, ASCII name");
  for (const k of ["documentationUrl", "supportUrl", "privacyPolicyUrl"]) assert.match(manifest[k] || "", /^https:\/\//, `${k} must be an https URL`);
  assert.match(manifest.privacyPolicyUrl, /PRIVACY\.md$/);
  assert.match(manifest.supportUrl, /\/issues$/);
  assert.ok(manifest.icon && fs.existsSync(path.join(root, manifest.icon.replace(/^\.\//, ""))), "icon must point to a file inside the plugin");
  assert.match(manifest.icon, /\.(png|jpe?g|svg|webp)$/i);
});

test("the plugin folder stays inside the directory's file limits and has no files it holds for review", () => {
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if ([".git", "node_modules"].includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(root);
  assert.ok(files.length <= 512, `${files.length} files; the directory holds plugins over 512 files for review`);
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join("/");
    if (/^(docs\/img\/|\.claude-plugin\/icon\.png$)/.test(rel)) continue;
    assert.ok(fs.statSync(f).size < 256 * 1024, `${rel} is over 256 KiB`);
    assert.doesNotMatch(rel, /\.(ico|pdf|zip|gz|tar|exe|dll|mp4|mov|ttf)$/i, `${rel} is a binary type the directory holds for review`);
    assert.doesNotMatch(rel, /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/, `${rel} is a system file`);
    assert.doesNotMatch(rel, /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|bun\.lockb?|\.npmrc|bunfig\.toml|uv\.toml)$/, `${rel}: lockfiles and registry configs are held for review`);
  }
});

test("hook and script commands never use package launchers", () => {
  const hooks = read("hooks", "hooks.json");
  assert.doesNotMatch(hooks, /\b(npx|bunx|uvx|pipx|pnpm dlx|yarn dlx)\b/);
  const commands = [];
  for (const groups of Object.values(JSON.parse(hooks).hooks)) for (const g of groups) for (const h of g.hooks) commands.push(h.command);
  assert.ok(commands.length >= 10, "the hook commands were found");
  for (const c of commands) assert.match(c, /\$\{CLAUDE_PLUGIN_ROOT\}/, `every hook command is rooted at CLAUDE_PLUGIN_ROOT: ${c}`);
});

test("PRIVACY.md states what the plugin collects, sends and runs, matching the code", () => {
  const p = read("PRIVACY.md");
  for (const part of ["does not collect", "telemetry", "api.github.com", "raw.githubusercontent.com", "SWIFTCRAFT_NO_UPDATE_CHECK", "gh", "temp", "never", "contact"]) assert.match(p, new RegExp(part, "i"), `PRIVACY.md misses ${part}`);
  assert.ok(p.split(/\s+/).length > 150, "a real policy, not a stub");
  const update = read("scripts", "update-check.js");
  assert.match(update, /api\.github\.com/);
  assert.match(update, /raw\.githubusercontent\.com/);
});

test("the README tells users everything the plugin runs, sends or fetches, and links the policy", () => {
  const r = read("README.md");
  assert.match(r, /## What the plugin runs, sends and fetches/);
  assert.match(r, /PRIVACY\.md/);
  for (const part of ["hooks", "update notice", "GitHub CLI", "only when you", "no telemetry"]) assert.match(r, new RegExp(part, "i"), `README misses ${part}`);
  assert.ok(r.replace(/```[\s\S]*?```/g, "").split(/\s+/).length >= 40, "README must have at least 40 words outside code blocks");
});

test("a submission guide records the steps only the account owner can do, and what is not verified", () => {
  const g = read("docs", "directory-submission.md");
  for (const part of ["claude.ai/directory/manage", "Plugin bundle", "Validate", "paid", "Not verified", "claude plugin validate --strict", "Policy hold"]) assert.match(g, new RegExp(part, "i"), `guide misses ${part}`);
});
