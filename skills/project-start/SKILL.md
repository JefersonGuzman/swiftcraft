---
name: project-start
description: Scaffold a new project with the swiftcraft structure (constitution, architecture, ADRs, feature documents). Use when starting a new platform/app/repo or adopting the harness in an existing one.
---

# project-start

Goal: a new project that is structured from commit zero. **If the project already has code, use `/swiftcraft:adopt` instead**: it analyzes what exists (read-only) and proposes documents without touching your code.

## Process

1. **Interview (max 5 questions, one at a time)**: what the product does, who uses it, stack (language/framework/DB), architecture variant (default: feature-first Hexagonal), deploy target. Skip anything already answered.
1b. **Pick the stack template** from `${CLAUDE_PLUGIN_ROOT}/templates/stacks/` (`nextjs`, `node-api`, `python-fastapi`). Its `STACK.md` replaces the folder tree and rules in `docs/architecture.md` and supplies the test/lint/build commands. If none fits, adapt the closest and say so; offer to add a new stack template.
2. **Copy the scaffold** from `${CLAUDE_PLUGIN_ROOT}/templates/project/` into the target directory. Never overwrite an existing file; report skipped ones.
3. **Fill placeholders** (`{{PROJECT_NAME}}`, `{{STACK}}`, `{{TEST_CMD}}`, `{{LINT_CMD}}`, `{{BUILD_CMD}}`) in `AGENTS.md`, `CLAUDE.md`, `docs/constitution.md`, `docs/architecture.md`.
4. **Create `.env.example`** with placeholders only (it is not in the template).
5. **Create the source skeleton** per `docs/architecture.md` for the first feature only — no empty speculative folders.
6. **Write ADR 0001** recording the stack and architecture choice (use skill `adr`).
7. **Stop** and show the tree plus the next step: `/swiftcraft:odd <first feature>`.

## Rules

- Stack-agnostic: adapt folder names to the language's idiom, keep the layer rules.
- Do not install dependencies or `git init` unless the user asks.
- Keep generated docs short; the constitution must fit in one screen.
