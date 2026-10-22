// Feature documents for the ODD workflow: odd/tasks/<feature-name>.md
//
//   # <Feature name>
//   Objective · Branch · Delivery · Runner (one or two header lines)
//   ## Specs   - S1: "the user's exact words"
//   ## Tasks   - [ ] T1 (S1) Outcome — route: inline · commit: abc1234 · done when: <observable check>
//   ## Log     - L1 (YYYY-MM-DD) the user's original request, verbatim
//   ## Needs your decision (optional)   - open blocker, one bullet each
const fs = require("fs");
const path = require("path");

const REQUIRED = ["Specs", "Tasks", "Log"];
const TASK_RE = /^- \[( |x|X)\]\s+(T\d+)\s*\(([^)]*)\)\s*(.*)$/;
const SPEC_RE = /^- (S\d+):\s*(.+)$/;
const LOG_RE = /^- (L\d+)\b\s*(.*)$/;

function expandRefs(raw) {
  const out = [];
  for (const token of String(raw).split(/[,\s]+/).filter(Boolean)) {
    const range = token.match(/^S(\d+)\s*[-–]\s*S(\d+)$/i);
    if (range) {
      for (let n = Number(range[1]); n <= Number(range[2]); n++) out.push(`S${n}`);
    } else if (/^S\d+$/i.test(token)) out.push(token.toUpperCase());
  }
  return out;
}

function parseMeta(rest) {
  const [outcome, ...tail] = rest.split(" — ");
  const meta = {};
  for (const part of tail.join(" — ").split(" · ")) {
    const m = part.match(/^\s*([a-z ]+?):\s*(.*?)\s*$/i);
    if (m) meta[m[1].toLowerCase()] = m[2];
  }
  const clean = (v) => (v && !/^[—–-]+$/.test(v) ? v : null);
  return { outcome: outcome.trim(), route: clean(meta.route), commit: clean(meta.commit), evidence: clean(meta.evidence), doneWhen: clean(meta["done when"]) };
}

function parseFeatureDoc(text) {
  const lines = String(text).replace(/^﻿/, "").split(/\r?\n/);
  const doc = { title: "", sections: [], specs: [], tasks: [], log: [], needsDecision: [], malformed: [] };
  let section = null;
  for (const line of lines) {
    const h = line.match(/^## (.+?)\s*$/);
    if (h) {
      section = h[1].trim();
      doc.sections.push(section);
      continue;
    }
    const t = line.match(/^# (.+?)\s*$/);
    if (t && !doc.title) {
      doc.title = t[1];
      continue;
    }
    if (section === "Specs") {
      const m = line.match(SPEC_RE);
      if (m) doc.specs.push({ id: m[1], text: m[2].trim() });
    } else if (section === "Tasks") {
      const m = line.match(TASK_RE);
      if (m) doc.tasks.push({ id: m[2], done: m[1] !== " ", specs: expandRefs(m[3]), raw: line, ...parseMeta(m[4]) });
      else if (/^- \[/.test(line)) doc.malformed.push(line);
    } else if (section === "Log") {
      const m = line.match(LOG_RE);
      if (m) doc.log.push({ id: m[1], text: m[2].trim() });
    } else if (section === "Needs your decision") {
      const m = line.match(/^- (.+)$/);
      if (m) doc.needsDecision.push(m[1].trim());
    }
  }
  return doc;
}

function checkFeatureDoc(text) {
  const d = parseFeatureDoc(text);
  const problems = [];
  for (const name of REQUIRED) if (!d.sections.includes(name)) problems.push(`Missing "## ${name}" section.`);
  const order = REQUIRED.map((n) => d.sections.indexOf(n));
  if (order.every((i) => i >= 0) && !(order[0] < order[1] && order[1] < order[2])) problems.push("Sections must appear in this order: Specs, Tasks, Log.");
  if (d.sections.includes("Log") && !d.log.some((l) => l.id === "L1")) problems.push("The Log must start with L1 (the user's original request, verbatim).");

  const seen = new Set();
  for (const id of [...d.specs.map((s) => s.id), ...d.tasks.map((t) => t.id)]) {
    if (seen.has(id)) problems.push(`Duplicate ID ${id}.`);
    seen.add(id);
  }
  for (const line of d.malformed) problems.push(`Malformed task line: ${line.trim()}`);

  const known = new Set(d.specs.map((s) => s.id));
  const covered = new Set();
  for (const t of d.tasks) {
    if (!t.specs.length) problems.push(`${t.id} has no linked spec (S#).`);
    for (const s of t.specs) {
      covered.add(s);
      if (!known.has(s)) problems.push(`${t.id} links ${s}, which does not exist.`);
    }
    if (!t.route) problems.push(`${t.id} has no route (inline or delegated).`);
    else if (!["inline", "delegated"].includes(t.route)) problems.push(`${t.id} has an invalid route "${t.route}" (inline or delegated).`);
    if (t.done && !t.commit && !t.evidence) problems.push(`${t.id} is ticked but records no commit or evidence.`);
  }
  for (const s of d.specs) if (!covered.has(s.id)) problems.push(`${s.id} is not covered by any task.`);
  return problems;
}

function statusOf(text) {
  const d = parseFeatureDoc(text);
  const open = d.tasks.filter((t) => !t.done);
  return { title: d.title, total: d.tasks.length, done: d.tasks.length - open.length, open, next: open[0] || null, needsDecision: d.needsDecision };
}

// The feature document to resume: the most recently modified one that still has open tasks, else the latest.
function findActiveDoc(cwd) {
  const dir = path.join(cwd, "odd", "tasks");
  let files = [];
  try {
    files = fs
      .readdirSync(dir)
      .filter((n) => n.endsWith(".md") && !n.startsWith("_"))
      .map((n) => ({ file: path.join(dir, n), rel: `odd/tasks/${n}`, mtime: fs.statSync(path.join(dir, n)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return null;
  }
  for (const f of files) {
    const s = statusOf(fs.readFileSync(f.file, "utf8"));
    if (s.open.length) return { ...f, status: s };
  }
  return files.length ? { ...files[0], status: statusOf(fs.readFileSync(files[0].file, "utf8")) } : null;
}

module.exports = { parseFeatureDoc, checkFeatureDoc, statusOf, findActiveDoc };
