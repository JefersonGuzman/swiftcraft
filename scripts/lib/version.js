// SemVer x.y.z with an optional prerelease (x.y.z-beta.1). A prerelease sorts before its release.
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function parse(v) {
  const m = String(v).trim().match(VERSION_RE);
  if (!m) throw new Error(`Invalid version "${v}" (expected x.y.z or x.y.z-beta.N).`);
  return { nums: m.slice(1, 4).map(Number), pre: m[4] ? m[4].split(".") : null };
}

const isPrerelease = (v) => parse(v).pre !== null;

function compareIdentifiers(a, b) {
  const na = /^\d+$/.test(a);
  const nb = /^\d+$/.test(b);
  if (na && nb) return Number(a) === Number(b) ? 0 : Number(a) < Number(b) ? -1 : 1;
  if (na !== nb) return na ? -1 : 1;
  return a === b ? 0 : a < b ? -1 : 1;
}

function compareVersions(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] < pb.nums[i] ? -1 : 1;
  }
  if (!pa.pre && !pb.pre) return 0;
  if (!pa.pre) return 1;
  if (!pb.pre) return -1;
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    if (pa.pre[i] === undefined) return -1;
    if (pb.pre[i] === undefined) return 1;
    const c = compareIdentifiers(pa.pre[i], pb.pre[i]);
    if (c) return c;
  }
  return 0;
}

// The next version for `major|minor|patch|beta|<explicit version>`.
// From a prerelease, major/minor/patch publish its stable version; `beta` bumps the counter, or starts
// x.y+1.0-beta.1 from a stable version.
function bump(current, arg) {
  const c = parse(current);
  const core = c.nums.join(".");
  if (["major", "minor", "patch"].includes(arg)) {
    if (c.pre) return core;
    const [ma, mi, pa] = c.nums;
    return arg === "major" ? `${ma + 1}.0.0` : arg === "minor" ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`;
  }
  if (arg === "beta") {
    if (c.pre && c.pre[0] === "beta" && /^\d+$/.test(c.pre[1] || "")) return `${core}-beta.${Number(c.pre[1]) + 1}`;
    if (c.pre) return `${core}-beta.1`;
    return `${c.nums[0]}.${c.nums[1] + 1}.0-beta.1`;
  }
  parse(arg);
  return String(arg).trim();
}

// Split a Keep-a-Changelog file into [{ version, text }] for "## [x.y.z]" headings (Unreleased is skipped).
function sections(changelog) {
  const out = [];
  let current = null;
  for (const line of String(changelog).split(/\r?\n/)) {
    const h = line.match(/^## \[([^\]]+)\]/);
    if (h) {
      current = VERSION_RE.test(h[1]) ? { version: h[1], lines: [line] } : null;
      if (current) out.push(current);
    } else if (current) current.lines.push(line);
  }
  return out.map((s) => ({ version: s.version, text: s.lines.join("\n").trim() }));
}

function changelogBetween(changelog, installed, latest) {
  return sections(changelog)
    .filter((s) => compareVersions(s.version, installed) > 0 && compareVersions(s.version, latest) <= 0)
    .map((s) => s.text)
    .join("\n\n");
}

function changelogSection(changelog, version) {
  const s = sections(changelog).find((x) => x.version === version);
  return s ? s.text : "";
}

module.exports = { compareVersions, changelogBetween, changelogSection, isPrerelease, bump };
