// Safe cleanup of what swiftcraft itself leaves in the OS temp folder:
//   - pull-request scratch folders created by pr-fetch.js:  swiftcraft-pr-<number>-<random>
//   - per-session state files created by the memory hooks:  swiftcraft-<session id>.json (older than 7 days)
// Everything else is ignored. Nothing outside the temp folder is ever touched, symlinks and junctions are never
// followed or deleted, recent entries are kept, and errors are returned (never swallowed).
const fs = require("fs");
const path = require("path");

const HOUR = 3600 * 1000;
const DIR_RE = /^swiftcraft-pr-\d+-[A-Za-z0-9]{4,}$/;
const STATE_RE = /^swiftcraft-[\w-]+\.json$/;
const KEEP = new Set(["swiftcraft-update-check.json"]);
const STATE_MIN_AGE_HOURS = 7 * 24;

const same = (a, b) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);

function cleanup({ tmpRoot, apply = false, olderThanHours = 24, dir = null, remove = (p) => fs.rmSync(p, { recursive: true, force: true }) }) {
  const out = { apply, root: tmpRoot, targets: [], deleted: [], wouldDelete: [], keptRecent: 0, ignored: [], errors: [], refused: [] };
  let root;
  try {
    root = fs.realpathSync(tmpRoot);
  } catch (e) {
    out.errors.push({ path: tmpRoot, error: `cannot read the temp folder: ${e.message}` });
    return out;
  }
  out.root = root;
  const now = Date.now();

  if (dir) {
    const p = path.resolve(dir);
    let st;
    try {
      st = fs.lstatSync(p);
    } catch {
      out.refused.push({ path: p, error: `does not exist: ${p}` });
      return out;
    }
    if (st.isSymbolicLink()) {
      out.refused.push({ path: p, error: `Refusing a symbolic link or junction: ${p}` });
      return out;
    }
    const real = fs.realpathSync(p);
    if (!same(path.dirname(real), root)) {
      out.refused.push({ path: p, error: `Refusing a path outside the temp folder (${root}): ${p}` });
      return out;
    }
    if (!st.isDirectory() || !DIR_RE.test(path.basename(real))) {
      out.refused.push({ path: p, error: `Refusing: not a swiftcraft scratch folder (swiftcraft-pr-<number>-<random>): ${p}` });
      return out;
    }
    out.targets.push({ path: real, ageHours: (now - st.mtimeMs) / HOUR });
  } else {
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      const p = path.join(root, e.name);
      const isDirName = DIR_RE.test(e.name);
      const isStateName = STATE_RE.test(e.name) && !KEEP.has(e.name);
      if (!isDirName && !isStateName) {
        if (e.name.startsWith("swiftcraft-") && !KEEP.has(e.name)) out.ignored.push({ name: e.name, reason: "unrecognized name" });
        continue;
      }
      let st;
      try {
        st = fs.lstatSync(p);
      } catch (err) {
        out.errors.push({ path: p, error: err.message });
        continue;
      }
      if (st.isSymbolicLink()) {
        out.ignored.push({ name: e.name, reason: "symbolic link or junction" });
        continue;
      }
      if ((isDirName && !st.isDirectory()) || (isStateName && !st.isFile())) {
        out.ignored.push({ name: e.name, reason: "unexpected type" });
        continue;
      }
      const ageHours = (now - st.mtimeMs) / HOUR;
      const minAge = isDirName ? olderThanHours : Math.max(olderThanHours, STATE_MIN_AGE_HOURS);
      if (ageHours >= minAge) out.targets.push({ path: p, ageHours });
      else out.keptRecent++;
    }
  }

  for (const t of out.targets) {
    if (!apply) {
      out.wouldDelete.push(t);
      continue;
    }
    try {
      remove(t.path);
      out.deleted.push(t);
    } catch (e) {
      out.errors.push({ path: t.path, error: e.message });
    }
  }
  return out;
}

module.exports = { cleanup, DIR_RE, STATE_RE };
