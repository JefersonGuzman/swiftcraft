// Whole-project import graph check (proof of concept, JavaScript/TypeScript only).
// Finds what the per-edit arch-lint hook cannot see: transitive layer violations, imports of another feature's
// internals, and dependency cycles. Read-only; static (regex) import detection, so dynamic or computed imports are missed.
const fs = require("fs");
const path = require("path");
const { loadRules, innerLayerOf, OUTER } = require("./arch.js");

const EXT = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"];
const SKIP_DIR = /^(node_modules|\.git|dist|build|coverage|\.next|out|vendor)$/;
const TEST_FILE = /(\.(test|spec)\.[a-z]+$)|(^|\/)(tests?|__tests__)\//;

function importsOf(source) {
  const src = String(source).replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join("\n");
  const found = new Set();
  const res = [/\bimport\s+(?:[^'"()]*?\s+from\s+)?["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, /\bexport\s+[^'"()]*?\s+from\s+["']([^"']+)["']/g, /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g];
  for (const re of res) for (const m of src.matchAll(re)) found.add(m[1]);
  return [...found];
}

function collect(root) {
  const files = [];
  const walk = (rel) => {
    let entries = [];
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (!SKIP_DIR.test(e.name)) walk(r);
      } else if (EXT.includes(path.extname(e.name)) && !TEST_FILE.test(r)) files.push(r);
    }
  };
  walk("");
  return files.sort();
}

function resolver(files) {
  const set = new Set(files);
  return (from, spec) => {
    if (!spec.startsWith(".")) return null;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    const tries = [base, ...EXT.map((e) => base + e), ...EXT.map((e) => `${base}/index${e}`)];
    if (/\.(js|jsx|mjs|cjs)$/.test(base)) tries.push(base.replace(/\.(js|jsx|mjs|cjs)$/, ".ts"), base.replace(/\.(js|jsx|mjs|cjs)$/, ".tsx"));
    return tries.find((t) => set.has(t)) || null;
  };
}

const featureOf = (p) => {
  const m = p.match(/(^|\/)(features|modules)\/([^/]+)\//);
  return m ? { container: p.slice(0, m.index + m[0].length - m[3].length - 2), name: m[3] } : null;
};
const isEntry = (rel) => /^(index|public|api)\.[a-z]+$/.test(rel) || /^(public|api)\//.test(rel);

function checkGraph(root) {
  const rules = loadRules(root);
  const files = collect(root);
  const resolve = resolver(files);
  const specs = new Map();
  const edges = new Map();
  for (const f of files) {
    let src = "";
    try {
      src = fs.readFileSync(path.join(root, f), "utf8");
    } catch {}
    const list = importsOf(src);
    specs.set(f, list);
    edges.set(f, list.map((s) => resolve(f, s)).filter(Boolean));
  }
  const violations = [];
  const patternsFor = (layer) => (layer === "domain" ? rules.domainForbidden : rules.applicationForbidden).map((r) => new RegExp(r, "i"));
  const forbiddenBare = (layer, spec) => patternsFor(layer).some((re) => re.test(`import x from "${spec}"`));

  for (const f of files) {
    const layer = innerLayerOf(f);
    let direct = false;
    if (layer) {
      for (const spec of specs.get(f)) {
        const target = resolve(f, spec);
        if (spec.startsWith(".")) {
          if (forbiddenBare(layer, spec) || (target && OUTER.test(target))) {
            violations.push({ kind: "layer", file: f, detail: `the ${layer} layer imports ${spec}, an outer layer`, chain: target ? [f, target] : [f] });
            direct = true;
          }
        } else if (forbiddenBare(layer, spec)) {
          violations.push({ kind: "framework", file: f, detail: `the ${layer} layer imports ${spec}, a forbidden framework or library`, chain: [f] });
          direct = true;
        }
      }
      if (!direct) {
        const prev = new Map([[f, null]]);
        const queue = [f];
        let hit = null;
        while (queue.length && !hit) {
          const cur = queue.shift();
          for (const next of edges.get(cur) || []) {
            if (prev.has(next)) continue;
            prev.set(next, cur);
            if (OUTER.test(next)) hit = { node: next, why: "an outer layer file" };
            else if ((specs.get(next) || []).some((s) => !s.startsWith(".") && forbiddenBare(layer, s))) hit = { node: next, why: "a file that imports a forbidden framework" };
            if (hit) break;
            queue.push(next);
          }
        }
        if (hit) {
          const chain = [];
          for (let n = hit.node; n; n = prev.get(n)) chain.unshift(n);
          violations.push({ kind: "transitive", file: f, detail: `the ${layer} layer reaches ${hit.why} through ${chain.length - 2} file(s)`, chain });
        }
      }
    }
    const mine = featureOf(f);
    if (mine) {
      for (const target of edges.get(f) || []) {
        const theirs = featureOf(target);
        if (!theirs || theirs.container !== mine.container || theirs.name === mine.name) continue;
        const rel = target.slice(`${theirs.container}/${theirs.name}/`.length);
        if (!isEntry(rel)) violations.push({ kind: "cross-feature", file: f, detail: `imports internals of feature ${theirs.name} (${target}); go through its index`, chain: [f, target] });
      }
    }
  }

  // Cycles: strongly connected components of more than one file (Tarjan).
  let index = 0;
  const idx = new Map();
  const low = new Map();
  const stack = [];
  const on = new Set();
  const strong = (v) => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    on.add(v);
    for (const w of edges.get(v) || []) {
      if (!idx.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        on.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) {
        comp.sort();
        violations.push({ kind: "cycle", file: comp[0], detail: `${comp.length} files import each other in a cycle`, chain: comp });
      }
    }
  };
  for (const f of files) if (!idx.has(f)) strong(f);

  violations.sort((a, b) => a.file.localeCompare(b.file) || a.kind.localeCompare(b.kind));
  return { files: files.length, violations };
}

module.exports = { checkGraph, importsOf };
