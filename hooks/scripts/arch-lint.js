#!/usr/bin/env node
// PostToolUse: enforce the dependency rule. Inner layers (domain, application)
// must not import outer layers or frameworks. Exit 2 feeds the message back to Claude.
// Override per project with docs/arch-rules.json:
//   { "domainForbidden": ["regex", ...], "applicationForbidden": ["regex", ...] }
const fs = require("fs");
const path = require("path");

const SRC = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|java|kt|cs)$/;

const DEFAULTS = {
  domainForbidden: [
    "(^|[\\/\\\"'.])(infrastructure|adapters?|presentation|ui|controllers?)([\\/\\\"'.]|$)",
    "from\\s+['\"](react|next|express|fastify|@nestjs/|prisma|@prisma/|mongoose|typeorm|axios|fs|node:fs)",
    "^\\s*(import|from)\\s+(django|flask|fastapi|sqlalchemy|requests)",
  ],
  applicationForbidden: [
    "(^|[\\/\\\"'.])(infrastructure|adapters?|presentation|ui|controllers?)([\\/\\\"'.]|$)",
    "from\\s+['\"](react|next|express|fastify|@nestjs/|prisma|@prisma/|mongoose|typeorm)",
  ],
};

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let file = "";
  try {
    file = (JSON.parse(raw).tool_input || {}).file_path || "";
  } catch {
    process.exit(0);
  }
  if (!file || !SRC.test(file) || !fs.existsSync(file)) process.exit(0);

  const norm = file.replace(/\\/g, "/");
  const layer = /\/domain\//.test(norm) ? "domain" : /\/application\//.test(norm) ? "application" : null;
  if (!layer) process.exit(0);

  let rules = DEFAULTS;
  try {
    const custom = path.join(process.cwd(), "docs", "arch-rules.json");
    if (fs.existsSync(custom)) rules = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(custom, "utf8")) };
  } catch {}

  const patterns = (layer === "domain" ? rules.domainForbidden : rules.applicationForbidden).map((r) => new RegExp(r, "i"));
  const hits = [];
  fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (!/\b(import|from|require|using)\b/.test(line)) return;
      if (patterns.some((re) => re.test(line))) hits.push(`  line ${i + 1}: ${line.trim()}`);
    });

  if (hits.length) {
    process.stderr.write(
      `swiftcraft arch-lint: ${path.basename(file)} is in the ${layer} layer and imports an outer layer or framework.\n` +
        hits.join("\n") +
        `\nFix: depend on a port (interface) defined in ${layer}/ and implement it in infrastructure/. See skill "architecture-guard".\n`
    );
    process.exit(2);
  }
  process.exit(0);
});
