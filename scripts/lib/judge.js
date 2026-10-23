// Deterministic merge of two independent reviews into coincident / discrepant / unconfirmed findings.
// No model is involved: the same two inputs always give the same report. Findings are
// { file, line, severity: blocker|should|nit, problem (or body/title), fix?, quote?, lens? }.
const { SEVERITIES, redact } = require("./review.js");

const NEAR = 3;
const RANK = { blocker: 3, should: 2, nit: 1 };

function list(input) {
  if (Array.isArray(input)) return input;
  if (input && Array.isArray(input.findings)) return input.findings;
  return null;
}

function validateFindings(input, label) {
  const items = list(input);
  if (!items) return [`${label}: the findings must be an array (or an object with a "findings" array).`];
  const problems = [];
  items.forEach((f, i) => {
    const n = i + 1;
    if (!f || typeof f !== "object") return problems.push(`${label}: finding ${n} must be an object.`);
    if (typeof f.file !== "string" || !f.file) problems.push(`${label}: finding ${n} needs a file.`);
    if (!SEVERITIES.includes(f.severity)) problems.push(`${label}: finding ${n} has an invalid severity "${f.severity}" (use ${SEVERITIES.join(", ")}).`);
    if (!text(f)) problems.push(`${label}: finding ${n} needs a problem description.`);
  });
  return problems;
}

const text = (f) => String(f.problem || f.body || f.title || "").trim();
const norm = (f, source) => ({ file: String(f.file).replace(/\\/g, "/"), line: Number.isFinite(Number(f.line)) ? Number(f.line) : 0, severity: f.severity, problem: redact(text(f)), fix: f.fix ? redact(String(f.fix)) : undefined, quote: f.quote ? String(f.quote).trim() : undefined, lens: f.lens, source });
const order = (a, b) => a.file.localeCompare(b.file) || a.line - b.line || RANK[b.severity] - RANK[a.severity] || a.problem.localeCompare(b.problem);
const same = (x, y) => x.file === y.file && ((x.quote && x.quote === y.quote) || Math.abs(x.line - y.line) <= NEAR);
const strip = ({ source, ...rest }) => Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));

function judge(inputA, inputB) {
  const A = (list(inputA) || []).map((f) => norm(f, "A")).sort(order);
  const B = (list(inputB) || []).map((f) => norm(f, "B")).sort(order);
  const used = new Set();
  const coincident = [];
  const discrepant = [];
  const unconfirmed = [];
  for (const a of A) {
    let best = -1;
    let bestDistance = Infinity;
    B.forEach((b, i) => {
      if (used.has(i) || !same(a, b)) return;
      const d = Math.abs(a.line - b.line);
      if (d < bestDistance) {
        best = i;
        bestDistance = d;
      }
    });
    if (best < 0) {
      unconfirmed.push({ ...strip(a), source: "A" });
      continue;
    }
    used.add(best);
    const b = B[best];
    if (a.severity === b.severity) coincident.push({ ...strip(a), sources: ["A", "B"], otherView: b.problem === a.problem ? undefined : b.problem });
    else discrepant.push({ file: a.file, line: a.line, a: strip(a), b: strip(b) });
  }
  B.forEach((b, i) => {
    if (!used.has(i)) unconfirmed.push({ ...strip(b), source: "B" });
  });
  for (const c of coincident) if (c.otherView === undefined) delete c.otherView;

  const blockerOpen = unconfirmed.some((u) => u.severity === "blocker") || discrepant.some((d) => d.a.severity === "blocker" || d.b.severity === "blocker");
  let verdict;
  if (coincident.some((c) => c.severity === "blocker")) verdict = "fix first";
  else if (blockerOpen || discrepant.length) verdict = "needs human decision";
  else if (coincident.some((c) => c.severity === "should")) verdict = "fix first";
  else if (coincident.length || unconfirmed.length) verdict = "ready with open questions";
  else verdict = "ready";
  return { verdict, coincident, discrepant, unconfirmed };
}

function format(r) {
  const at = (x) => `${x.file}:${x.line}`;
  const out = [`Verdict: ${r.verdict}`, "", `Coincident (both reviewers, same severity): ${r.coincident.length}`];
  for (const c of r.coincident) out.push(`  [${c.severity}] ${at(c)} — ${c.problem}${c.fix ? ` — ${c.fix}` : ""}`);
  out.push("", `Discrepant (same place, different severity — you decide): ${r.discrepant.length}`);
  for (const d of r.discrepant) out.push(`  ${at(d)} — A: [${d.a.severity}] ${d.a.problem} | B: [${d.b.severity}] ${d.b.problem}`);
  out.push("", `Unconfirmed (only one reviewer saw it): ${r.unconfirmed.length}`);
  for (const u of r.unconfirmed) out.push(`  [${u.severity}] ${at(u)} — ${u.problem} (reviewer ${u.source})`);
  return out.join("\n");
}

module.exports = { judge, validateFindings, format };
