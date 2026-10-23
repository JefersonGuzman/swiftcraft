# Other coding agents

Status: pilot not verified. swiftcraft is a Claude Code plugin; for other agents it only generates rule files from your `AGENTS.md`.

`node scripts/export-agents.js` (or `/swiftcraft:export`) writes:

| Agent | File | How it is expected to work |
|-------|------|----------------------------|
| Cursor | `.cursor/rules/swiftcraft.mdc` | copy of `AGENTS.md` with `alwaysApply: true` |
| Gemini CLI | `GEMINI.md` | imports `AGENTS.md` with `@./AGENTS.md` |
| GitHub Copilot | `.github/copilot-instructions.md` | copy of `AGENTS.md` |
| Codex, OpenCode | none | read `AGENTS.md` directly |

## What is and is not verified

- Verified: the files are generated, contents are as above (`tests/`).
- **Not verified**: that any of these agents actually follows the rules. The skills, hooks, command guard and reviews do not exist outside Claude Code; only the written rules travel.
- Pilot attempt (Gemini CLI, the first candidate because it is installed on the maintainer's machine): the CLI refused to run without an authentication method (`GEMINI_API_KEY`, Vertex or Google sign-in), so whether it reads `GEMINI.md` and follows the imported rules was **not tested**. To test it yourself, authenticate Gemini CLI, put a distinctive rule in `AGENTS.md` (for example a codeword), run the export, and ask the agent in that folder what the codeword is. Record the result here.

Until a pilot passes, treat support for other agents as experimental.
