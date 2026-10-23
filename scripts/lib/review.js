const { parseDiffLines } = require("./diff.js");

const SEVERITIES = ["blocker", "should", "nit"];
const LABEL = { blocker: "Blocker", should: "Should fix", nit: "Nit" };
const MAX_INLINE = 30;

const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
];

function redact(text) {
  return SECRET_PATTERNS.reduce((t, re) => t.replace(re, "[redacted]"), String(text));
}

function validate(input, headSha) {
  if (!headSha) throw new Error("Missing head commit sha (commit_id).");
  if (!input || typeof input.summary !== "string" || !input.summary.trim()) throw new Error("findings.summary is required.");
  const list = Array.isArray(input.findings) ? input.findings : null;
  if (!list) throw new Error("findings.findings must be an array.");
  list.forEach((f, i) => {
    const at = `findings[${i}]`;
    if (!f || typeof f.path !== "string" || !f.path) throw new Error(`${at}.path is required.`);
    if (!Number.isInteger(f.line) || f.line < 1) throw new Error(`${at}.line must be a positive integer.`);
    if (!SEVERITIES.includes(f.severity)) throw new Error(`${at}.severity must be one of ${SEVERITIES.join(", ")}.`);
    if (typeof f.title !== "string" || !f.title) throw new Error(`${at}.title is required.`);
    if (typeof f.body !== "string" || !f.body) throw new Error(`${at}.body is required.`);
    if (f.quote !== undefined && typeof f.quote !== "string") throw new Error(`${at}.quote must be a string.`);
  });
  return list;
}

const render = (f) => `**${LABEL[f.severity]}** — ${redact(f.title)}\n\n${redact(f.body)}` + (f.suggestion ? `\n\n\`\`\`suggestion\n${redact(f.suggestion)}\n\`\`\`` : "");

const norm = (s) => String(s).replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");

// Decide where a finding can be anchored. The reviewer must quote the source line it means; the quote is
// checked against the diff so a wrong line number can never produce a comment on the wrong line.
//   - line holds the quote            -> keep the line
//   - another line holds it (unique)  -> relocate to that line
//   - otherwise (or no quote)         -> not anchorable, goes to the review body
function resolveLine(f, fileLines) {
  if (!fileLines || !f.quote || !norm(f.quote)) return null;
  const q = norm(f.quote);
  const at = fileLines.get(f.line);
  if (at !== undefined && norm(at).includes(q)) return f.line;
  const hits = [...fileLines].filter(([, text]) => norm(text).includes(q)).map(([n]) => n);
  return hits.length === 1 ? hits[0] : null;
}

// Build a GitHub "create review" payload. Event is always COMMENT: the human decides approve/request-changes.
// Findings whose line is not in the diff (or beyond the inline cap) go into the review body instead.
function buildReview(input, diffText, headSha) {
  const list = validate(input, headSha);
  const diffLines = parseDiffLines(diffText);
  const ordered = [...list].sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));

  const inline = [];
  const rest = [];
  for (const f of ordered) {
    const line = resolveLine(f, diffLines[f.path]);
    if (line !== null && inline.length < MAX_INLINE) inline.push({ ...f, line });
    else rest.push(f);
  }

  const counts = SEVERITIES.map((s) => `${list.filter((f) => f.severity === s).length} ${LABEL[s].toLowerCase()}`).join(" · ");
  let body = `### swiftcraft review\n\n${redact(input.summary.trim())}\n\n`;
  if (input.verdict) body += `**Verdict:** ${redact(input.verdict)} (${counts})\n`;
  else body += `${counts}\n`;
  if (rest.length) {
    body += `\n#### Other findings\n` + rest.map((f) => `- \`${f.path}:${f.line}\` ${render(f).replace(/\n+/g, " ")}`).join("\n") + "\n";
  }
  body += `\n_Automated review by swiftcraft; findings are suggestions, please verify._`;

  return {
    payload: {
      commit_id: headSha,
      event: "COMMENT",
      body,
      comments: inline.map((f) => ({ path: f.path, line: f.line, side: "RIGHT", body: render(f) })),
    },
    stats: { inline: inline.length, inBody: rest.length, total: list.length },
  };
}

module.exports = { buildReview, redact, validate, MAX_INLINE, SEVERITIES, SECRET_PATTERNS };
