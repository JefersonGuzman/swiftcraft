# Dependency graph check

Status: proof of concept, optional, JavaScript/TypeScript only.

`node scripts/arch-graph.js check` builds the import graph of the project and reports what the per-edit `arch-lint` hook cannot see. It is read-only and is not wired into any hook or CI.

| Kind | Meaning | `arch-lint` sees it? |
|------|---------|----------------------|
| layer | a `domain`/`application` file imports an outer layer directly | yes, in the file being edited |
| framework | a `domain`/`application` file imports a forbidden library directly | yes, in the file being edited |
| transitive | a `domain`/`application` file reaches an outer layer or a forbidden library through other files | no |
| cross-feature | a file under `features/<a>` or `modules/<a>` imports the internals of `<b>` instead of its `index`, `public` or `api` entry | no |
| cycle | files that import each other, directly or not | no |

Rules come from the same defaults as `arch-lint`, extended by `docs/arch-rules.json`.

## What was measured

`tests/arch-graph.test.js` plants one violation of each kind in a small project and runs both tools. `arch-lint` flags only the direct import (1 of the 2 layer problems); the graph flags the direct and the transitive one, the cross-feature import and the cycle, and raises no false positive on the clean file. That shows the graph covers cases the hook cannot. It does not show how often these cases happen in real projects, and it has not been run on a large real codebase.

## Limits

- JavaScript/TypeScript only (`.js .jsx .mjs .cjs .ts .tsx`); Python, Go, Java, Kotlin and C# are not analyzed.
- Imports are found with regular expressions: dynamic or computed imports, path aliases (`@/...`) and bundler-specific resolution are not followed, so edges through them are missed.
- Layers and features are recognized by folder names (`domain`, `application`, `infrastructure`, `features/<name>`, `modules/<name>`).
- Tests and `node_modules` are skipped.

## CodeGraph

A code-graph index such as CodeGraph could answer richer questions (calls, symbols, blast radius), but it was **not evaluated** here: indexing a project is the user's decision, and the import-level checks above did not need it. Compare it against this script on a real project before choosing one.

## Decision

Keep `arch-lint` as the always-on hook (cheap, immediate feedback on the edited file). Use `arch-graph` on demand, or in CI, when you want the whole-project view. Promote it to a hook or a CI step only after it has run on a real project without noise.
