// Parse a unified diff into { "<path>": Set<rightSideLineNumber> }.
// Only lines present on the RIGHT side of the diff (added or context) can receive inline PR comments.
function parseDiff(text) {
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
        current = files[name] = files[name] || new Set();
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
    if (line.startsWith("+")) current.add(right++);
    else if (line.startsWith("-") || line.startsWith("\\")) continue;
    else if (line.startsWith(" ") || line === "") {
      if (line === "" ) continue;
      current.add(right++);
    }
  }
  return files;
}

module.exports = { parseDiff };
