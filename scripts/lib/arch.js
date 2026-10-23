// Architecture rules shared by the per-edit hook (hooks/scripts/arch-lint.js) and the whole-project graph check
// (scripts/arch-graph.js). Override per project with docs/arch-rules.json:
//   { "domainForbidden": ["regex", ...], "applicationForbidden": ["regex", ...] }
const fs = require("fs");
const path = require("path");

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

function loadRules(cwd) {
  try {
    const custom = path.join(cwd, "docs", "arch-rules.json");
    if (fs.existsSync(custom)) return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(custom, "utf8")) };
  } catch {}
  return DEFAULTS;
}

// "domain" or "application" when the path is in an inner layer, else null.
function innerLayerOf(p) {
  const n = String(p).replace(/\\/g, "/");
  return /(^|\/)domain\//.test(n) ? "domain" : /(^|\/)application\//.test(n) ? "application" : null;
}

const OUTER = /(^|\/)(infrastructure|adapters?|presentation|ui|controllers?)\//;

module.exports = { DEFAULTS, loadRules, innerLayerOf, OUTER };
