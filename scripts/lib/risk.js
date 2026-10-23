// File-path risk classification shared by delivery (and later review), mapped to the ODD high-risk items:
//   1 data or irreversible effects · 2 security · 3 contracts others consume · 5 delivery or environment
//   6 no test would catch a regression (code changed and no test file touched)
// Items 4 (concurrency) cannot be seen from a path; the reviewer judges it from the code.
// Pure and deterministic: the same files always give the same answer.

const CODE_EXT = /\.(js|jsx|mjs|cjs|ts|tsx|py|go|rs|java|kt|rb|php|cs|swift|c|cc|cpp|h|hpp|vue|svelte|dart|scala)$/i;
const TEST_RE = /(^|\/)(tests?|__tests__|spec|specs)\/|\.(test|spec)\.[a-z]+$|(^|\/)test_[^/]+$|_test\.[a-z]+$/i;
const DOC_RE = /\.(md|mdx|rst|txt)$|(^|\/)docs?\//i;
const LOCK_RE = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|go\.sum|poetry\.lock|Pipfile\.lock|composer\.lock|Gemfile\.lock|bun\.lockb?)$/;
const GENERATED_RE = /(^|\/)(dist|build|coverage|node_modules|\.next|out)\/|\.min\.(js|css)$|\.map$/;

const STATIC_ASSET_RE = /\.(html?|css|svg|png|jpe?g|gif|webp|ico|mp4|webm|woff2?)$/i;

const RULES = [
  { n: 1, why: "data or irreversible effects", re: /(^|\/)(migrations?|db\/migrate)\/|\.sql$/i },
  { n: 2, why: "security", re: /(^|\/)(auth|authn|authz|security|crypto|permissions?|rbac|oauth|secrets?|credentials?)(\/|\.|$)|guard|(^|\/)\.env/i },
  { n: 3, why: "contracts others consume", re: /(openapi|swagger)[^/]*\.(ya?ml|json)$|\.proto$|\.graphql$/i },
  { n: 5, why: "delivery or environment", re: /(^|\/)\.github\/workflows\/|(^|\/)(Dockerfile|docker-compose[^/]*|Makefile|Jenkinsfile)$|\.tf$|(^|\/)package\.json$|(^|\/)(requirements[^/]*\.txt|pyproject\.toml|Cargo\.toml|go\.mod|pom\.xml|build\.gradle)$/i },
];

const norm = (p) => String(p).replace(/\\/g, "/");
const isTest = (p) => TEST_RE.test(norm(p));
const isGenerated = (p) => LOCK_RE.test(norm(p)) || GENERATED_RE.test(norm(p));
const isDoc = (p) => DOC_RE.test(norm(p)) && !isTest(p);
const isCode = (p) => CODE_EXT.test(norm(p)) && !isTest(p) && !isGenerated(p);

// Which ODD items a single path names (lockfiles count as dependencies, item 5).
function itemsFor(p) {
  const f = norm(p);
  if (STATIC_ASSET_RE.test(f)) return []; // pages and media are not executable: a "guard" in the name is not security code
  const out = RULES.filter((r) => r.re.test(f)).map((r) => ({ n: r.n, why: r.why }));
  if (LOCK_RE.test(f) && !out.some((i) => i.n === 5)) out.push({ n: 5, why: "delivery or environment" });
  return out;
}

// files: [{ path, added, removed }] -> { tier: low|medium|high, items: [{ n, why, files }] }
function assess(files) {
  const list = files.map((f) => norm(f.path));
  const byItem = new Map();
  for (const p of list) {
    if (isDoc(p) && !/(^|\/)\.env/.test(p)) continue;
    for (const i of itemsFor(p)) {
      if (!byItem.has(i.n)) byItem.set(i.n, { n: i.n, why: i.why, files: [] });
      byItem.get(i.n).files.push(p);
    }
  }
  const code = list.filter(isCode);
  if (code.length && !list.some(isTest)) byItem.set(6, { n: 6, why: "no test would catch a regression", files: code });
  const items = [...byItem.values()].sort((a, b) => a.n - b.n);
  const sensitive = items.some((i) => i.n !== 6);
  const real = list.filter((p) => !isDoc(p) && !isGenerated(p));
  const tier = sensitive ? "high" : real.length ? "medium" : list.length && list.every(isGenerated) ? "high" : "low";
  return { tier, items };
}

module.exports = { assess, itemsFor, isTest, isDoc, isCode, isGenerated };
