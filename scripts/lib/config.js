// Per-project configuration: swiftcraft.config.json at the project root.
// Precedence: defaults < project file < environment variables.
// Only low-stakes behavior is configurable. Mandatory controls (the command guard's deny rules, protected files)
// cannot be changed here. An invalid file is ignored as a whole (defaults apply) and every problem is reported.
const fs = require("fs");
const path = require("path");
const { SECRET_PATTERNS } = require("./review.js");

const FILE = "swiftcraft.config.json";
const DEFAULTS = { memory: { nudge: true, nudgeEdits: 3 }, review: { reminder: true }, updates: { check: true }, delivery: { advisoryLines: 400 } };

const SPEC = {
  "memory.nudge": { type: "bool" },
  "memory.nudgeEdits": { type: "int", min: 1, max: 100 },
  "review.reminder": { type: "bool" },
  "updates.check": { type: "bool" },
  "delivery.advisoryLines": { type: "int", min: 50, max: 5000 },
};
const MANDATORY = /^(guard|protect|protectfiles|protect-files|commandguard|command-guard|denyrules)$/i;
const SECRET_KEY = /token|secret|passw|api[_-]?key|credential/i;

const clone = (o) => JSON.parse(JSON.stringify(o));
const get = (o, p) => p.split(".").reduce((x, k) => (x == null ? x : x[k]), o);
function set(o, p, v) {
  const ks = p.split(".");
  const last = ks.pop();
  ks.reduce((x, k) => x[k], o)[last] = v;
}

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function closest(name, options) {
  const best = options.map((o) => [o, distance(name.toLowerCase(), o.toLowerCase())]).sort((x, y) => x[1] - y[1])[0];
  return best && best[1] <= 2 ? best[0] : null;
}

function validate(cfg) {
  const errors = [];
  const values = {};
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return { errors: [`${FILE} must be a JSON object.`], values };
  const groups = Object.keys(DEFAULTS);
  const known = new Set([...groups, "version", "$schema"]);
  for (const [k, v] of Object.entries(cfg)) {
    if (SECRET_KEY.test(k)) errors.push(`"${k}" looks like a secret or credential. ${FILE} is committed to the repository and must not hold secrets.`);
    else if (MANDATORY.test(k)) errors.push(`"${k}" is a mandatory control and cannot be configured here. The command guard's extra rules live in docs/guard-rules.json (deny rules can never be relaxed).`);
    else if (!known.has(k)) {
      const hint = closest(k, [...known]);
      errors.push(`Unknown setting "${k}".${hint ? ` Did you mean "${hint}"?` : ""} Valid settings: ${Object.keys(SPEC).join(", ")}.`);
    } else if (k === "version") {
      if (v !== 1) errors.push("version must be 1.");
    } else if (k === "$schema") {
      continue;
    } else if (!v || typeof v !== "object" || Array.isArray(v)) errors.push(`${k} must be an object.`);
    else {
      for (const [sk, sv] of Object.entries(v)) {
        const path_ = `${k}.${sk}`;
        const spec = SPEC[path_];
        if (SECRET_KEY.test(sk)) errors.push(`"${path_}" looks like a secret or credential. ${FILE} must not hold secrets.`);
        else if (!spec) {
          const hint = closest(sk, Object.keys(DEFAULTS[k]));
          errors.push(`Unknown setting "${path_}".${hint ? ` Did you mean "${k}.${hint}"?` : ""}`);
        } else if (typeof sv === "string" && SECRET_PATTERNS.some((re) => new RegExp(re.source, re.flags.replace("g", "")).test(sv))) {
          errors.push(`${path_} holds a value that looks like a credential; ${FILE} must not hold secrets.`);
        } else if (spec.type === "bool") {
          if (typeof sv !== "boolean") errors.push(`${path_} must be true or false.`);
          else {
            values[k] = values[k] || {};
            values[k][sk] = sv;
          }
        } else if (!Number.isInteger(sv) || sv < spec.min || sv > spec.max) errors.push(`${path_} must be a whole number from ${spec.min} to ${spec.max}.`);
        else {
          values[k] = values[k] || {};
          values[k][sk] = sv;
        }
      }
    }
  }
  return { errors, values };
}

// Nearest swiftcraft.config.json at or above `start`, stopping at the repository root.
function findFile(start) {
  let dir = path.resolve(start);
  for (let i = 0; i < 12; i++) {
    const f = path.join(dir, FILE);
    if (fs.existsSync(f)) return f;
    if (fs.existsSync(path.join(dir, ".git"))) return null;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  return null;
}

function loadConfig(start, env = process.env) {
  const values = clone(DEFAULTS);
  const sources = Object.fromEntries(Object.keys(SPEC).map((k) => [k, "default"]));
  const errors = [];
  const file = findFile(start || process.cwd());
  if (file) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      errors.push(`${FILE} is not valid JSON (${e.message.replace(/\s+/g, " ").slice(0, 120)}).`);
    }
    if (parsed !== undefined) {
      const v = validate(parsed);
      errors.push(...v.errors);
      if (!v.errors.length) {
        for (const p of Object.keys(SPEC)) {
          const x = get(v.values, p);
          if (x !== undefined) {
            set(values, p, x);
            sources[p] = "project";
          }
        }
      }
    }
  }
  const envSet = (p, v) => {
    set(values, p, v);
    sources[p] = "env";
  };
  if (env.SWIFTCRAFT_NO_NUDGE === "1") envSet("memory.nudge", false);
  if (/^\d+$/.test(env.SWIFTCRAFT_NUDGE_EDITS || "")) envSet("memory.nudgeEdits", Number(env.SWIFTCRAFT_NUDGE_EDITS));
  if (env.SWIFTCRAFT_NO_REVIEW_REMINDER === "1") envSet("review.reminder", false);
  if (env.SWIFTCRAFT_NO_UPDATE_CHECK === "1") envSet("updates.check", false);
  return { values, sources, errors, file };
}

module.exports = { loadConfig, validate, DEFAULTS, SPEC, FILE };
