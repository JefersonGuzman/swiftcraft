// Review evidence for sensitive changes: which sensitive files changed, a hash of that diff, and whether a review
// of exactly that diff already happened in this session. Read-only; used by the review-track and review-reminder hooks.
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { workingChanges, repoRoot } = require("./delivery.js");
const { itemsFor, isDoc, isTest } = require("./risk.js");

function sensitiveState(cwd) {
  const root = repoRoot(cwd);
  if (!root) return null;
  const files = workingChanges(root)
    .filter((c) => !isDoc(c.path) && !isTest(c.path))
    .map((c) => ({ path: c.path, items: itemsFor(c.path).filter((i) => i.n !== 6) }))
    .filter((f) => f.items.length)
    .sort((a, b) => a.path.localeCompare(b.path));
  if (!files.length) return { root, files: [], hash: "" };
  const h = crypto.createHash("sha1");
  for (const f of files) {
    h.update(f.path + "\0");
    try {
      h.update(fs.readFileSync(path.join(root, f.path)));
    } catch {
      h.update("deleted");
    }
  }
  return { root, files, hash: h.digest("hex") };
}

const stateFile = (sessionId) => path.join(process.env.SWIFTCRAFT_STATE_DIR || os.tmpdir(), `swiftcraft-review-${String(sessionId || "nosession").replace(/[^\w-]/g, "")}.json`);

function readState(sessionId) {
  try {
    return JSON.parse(fs.readFileSync(stateFile(sessionId), "utf8"));
  } catch {
    return {};
  }
}

function writeState(sessionId, state) {
  try {
    fs.writeFileSync(stateFile(sessionId), JSON.stringify(state));
  } catch {}
}

// A review is a swiftcraft reviewer subagent or the review skills. Anything else is not evidence.
function isReviewCall(toolName, toolInput) {
  const input = toolInput || {};
  if (/^(Agent|Task)$/.test(toolName)) return /^(swiftcraft:)?(reviewer|pr-reviewer)$/.test(String(input.subagent_type || ""));
  if (toolName === "Skill") return /^(swiftcraft:)?(review|review-gate|pr-review)$/.test(String(input.skill || ""));
  return false;
}

module.exports = { sensitiveState, readState, writeState, isReviewCall };
