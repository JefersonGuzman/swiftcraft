# Privacy policy

Last updated: 2026-10-25. Applies to the swiftcraft plugin for Claude Code (https://github.com/JefersonGuzman/swiftcraft).

swiftcraft is a plugin that runs on your computer, inside Claude Code. The maintainer runs no server for it and receives nothing from you.

## What the plugin does not do

- It does not collect, store or transmit personal data, project code, prompts, commands or file contents to the maintainer or to any third party it operates. There is no telemetry, analytics, tracking or crash reporting.
- It never sends the contents of your prompts or your files anywhere by itself. Your conversations with Claude are handled by Claude Code and Anthropic under their own terms and privacy policy, not by this plugin.

## What it reads and writes locally

- Hooks read the JSON that Claude Code gives them for each tool call or prompt (for example the file path or the command) to apply their rules: block secret writes, ask before risky commands, stop a prompt that contains a token, remind you to review. They process it in memory and act on it locally.
- Small state files are written to your operating system's temp folder: per-session counters (edit and review counts), a guard log that keeps only the decision and the rule ids (never the command text), and an update-check cache. Files older than 7 days are pruned, and `scripts/cleanup.js` removes the rest on request.
- Optional project files you create (`odd/tasks/`, `docs/`, `swiftcraft.config.json`) stay in your repository.

## What it fetches from the network

- **Update notice** (once every 24 hours at session start, and when you run `/swiftcraft:update`): a request to `api.github.com` (the latest release of this repository) and, as a fallback, `raw.githubusercontent.com` (the public `plugin.json` and `CHANGELOG.md`). The requests carry no information about you or your project beyond what any HTTP request exposes to GitHub (your IP address and a `swiftcraft-update-check` user agent). Turn it off with `SWIFTCRAFT_NO_UPDATE_CHECK=1` or `updates.check` in `swiftcraft.config.json`.
- **Pull request review** (`/swiftcraft:pr-review`) uses your own authenticated GitHub CLI (`gh`) to read a pull request, and posts a review only after you confirm. Credentials stay with `gh`; the plugin never reads or stores them.
- **Optional setup** (`scripts/setup-engram.js --apply`, `--with-rtk`) installs third-party tools (Engram, RTK) only when you run it with those flags.

Anything else that touches the network (for example `git push` or a package install) is a command you or Claude run with your confirmation, under the permissions you set in Claude Code.

## Third parties

swiftcraft integrates with, but is not operated by, Claude Code and Anthropic, GitHub, Engram and RTK. Their handling of data is governed by their own policies.

## Children

The plugin is a developer tool and is not directed at children.

## Changes and contact

If this policy changes, the change appears in this file and in `CHANGELOG.md`. Questions or concerns: open an issue at https://github.com/JefersonGuzman/swiftcraft/issues, or use the private reporting channel described in `SECURITY.md`.
