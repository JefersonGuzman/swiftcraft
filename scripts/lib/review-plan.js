// Risk-tiered review plan: how many independent reviewers a change deserves, which lenses each applies, and a rough
// cost estimate to tell the user BEFORE any reviewer runs. Pure and deterministic.
const { assess, isGenerated } = require("./risk.js");

const LENSES = {
  risk: "Blast radius: can this harm stored data, security, a public contract, delivery or environment, or behavior that other code relies on? Is the Risk line honest?",
  resilience: "Failure modes: errors, empty and invalid input, retries, partial failure, concurrency and ordering, and what happens when a dependency misbehaves.",
  readability: "Clarity: names reveal intent, units are small, no dead code or debug output, comments explain why, docs and help text match the behavior.",
  reliability: "Proof: tests assert observable behavior, are deterministic, cover the named cases and would catch a regression in what changed.",
};

const MAX_CORRECTION_ROUNDS = 1;

function reviewPlan(files) {
  const real = files.filter((f) => !isGenerated(f.path));
  const { tier, items } = assess(files);
  const lines = real.reduce((n, f) => n + f.added + f.removed, 0);
  let reviewers = [];
  if (files.length) {
    if (tier === "low") reviewers = [{ id: "reviewer-1", lenses: ["readability"] }];
    else if (tier === "medium") reviewers = [{ id: "reviewer-1", lenses: ["reliability", "resilience", "readability"] }];
    else reviewers = [{ id: "reviewer-1", lenses: ["risk", "resilience"] }, { id: "reviewer-2", lenses: ["reliability", "readability"] }];
  }
  const perReviewer = 6000 + lines * 14;
  return {
    tier,
    items,
    files: files.map((f) => f.path),
    authoredLines: lines,
    reviewers,
    maxCorrectionRounds: MAX_CORRECTION_ROUNDS,
    estimate: { perReviewerTokens: perReviewer, totalTokens: perReviewer * reviewers.length, note: "Rough estimate (about 6k tokens plus 14 per changed line per reviewer), not a measurement." },
  };
}

function formatPlan(p) {
  if (!p.reviewers.length) return "Nothing to review: there are no changes.";
  const out = [`Review plan — risk tier: ${p.tier}${p.items.length ? ` (${p.items.map((i) => `item ${i.n}: ${i.why}`).join("; ")})` : ""}`, ""];
  out.push(`${p.reviewers.length} reviewer(s), each independent, fresh context and read-only; about ${p.authoredLines} changed line(s) in ${p.files.length} file(s).`);
  for (const r of p.reviewers) out.push(`  ${r.id}: ${r.lenses.map((l) => `${l} — ${LENSES[l]}`).join("\n      ")}`);
  out.push("", `Cost: about ${Math.round(p.estimate.totalTokens / 1000)}k tokens in total. ${p.estimate.note}`);
  out.push(`Tell the user this before starting${p.reviewers.length > 1 ? " and wait for their go-ahead" : ""}. Findings are fixed in at most one correction round; anything still open after it goes to the user.`);
  return out.join("\n");
}

module.exports = { reviewPlan, formatPlan, LENSES, MAX_CORRECTION_ROUNDS };
