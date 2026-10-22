// Accept only a PR number or a github.com pull-request URL. Anything else is rejected
// before it can reach a command line.
function parsePrRef(input) {
  const s = String(input || "").trim();
  if (/^[1-9]\d{0,8}$/.test(s)) return { number: Number(s), repo: null };
  const m = s.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/([1-9]\d{0,8})\/?$/);
  if (m) return { number: Number(m[2]), repo: m[1] };
  throw new Error(`Invalid PR reference "${s}". Use a PR number or https://github.com/<owner>/<repo>/pull/<n>.`);
}

module.exports = { parsePrRef };
