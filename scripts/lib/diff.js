// Parse a unified diff.
//   parseDiffLines(text) -> { "<path>": Map<rightSideLineNumber, lineText> }
//   parseDiff(text)      -> { "<path>": Set<rightSideLineNumber> }
// Only lines on the RIGHT (new) side of the diff, added or context, can receive inline PR comments.
function parseDiffLines(text) {
  const files = {};
  let current = null;
  let right = 0;
  for (const line of String(text).split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      current = null;
      continue;
    }
    if (line.startsWith("+++ ")) {
      const p = line.slice(4).trim();
      if (p === "/dev/null") {
        current = null;
      } else {
        const name = p.replace(/^b\//, "");
        current = files[name] = files[name] || new Map();
      }
      continue;
    }
    if (line.startsWith("--- ")) continue;
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      right = Number(hunk[1]);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+")) current.set(right++, line.slice(1));
    else if (line.startsWith("-") || line.startsWith("\\")) continue;
    else if (line.startsWith(" ")) current.set(right++, line.slice(1));
  }
  return files;
}

function parseDiff(text) {
  const out = {};
  for (const [file, lines] of Object.entries(parseDiffLines(text))) out[file] = new Set(lines.keys());
  return out;
}

module.exports = { parseDiff, parseDiffLines };
