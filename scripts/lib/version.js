const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;

function parse(v) {
  const m = String(v).trim().match(VERSION_RE);
  if (!m) throw new Error(`Invalid version "${v}" (expected x.y.z).`);
  return m.slice(1).map(Number);
}

function compareVersions(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
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

module.exports = { compareVersions, changelogBetween, changelogSection };
