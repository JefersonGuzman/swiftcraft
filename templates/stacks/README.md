# Stack templates

`/swiftcraft:init` (skill `project-start`) copies the chosen `STACK.md` content into the new project's `docs/architecture.md` and fills `{{TEST_CMD}}`, `{{LINT_CMD}}`, `{{BUILD_CMD}}`.

| Stack | Folder |
|-------|--------|
| Next.js App Router + TypeScript | `nextjs/` |
| Node.js API (TypeScript, Hexagonal) | `node-api/` |
| Python + FastAPI (Hexagonal) | `python-fastapi/` |

Add a stack: create `templates/stacks/<name>/STACK.md` with the folder tree, rules, typical commands and test levels. Keep the dependency rule identical across stacks.
