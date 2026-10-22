# Security policy

## Supported versions

Only the latest released version receives fixes. Check yours with `/swiftcraft:update`.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private reporting:
**Security tab → "Report a vulnerability"** on https://github.com/JefersonGuzman/swiftcraft/security/advisories/new

Include what you found, how to reproduce it, and the version (`/swiftcraft:update` prints it). You will get an answer as soon as possible; there is no bug bounty.

## What swiftcraft does on your machine (so you can judge the risk)

- **Hooks** run local Node scripts: they read the tool-call JSON Claude Code sends, can block writes to `.env`/key files, and write a small counter file in the OS temp directory. They make no network calls except the update notice below.
- **Update notice** (once per 24 h, `SessionStart`): fetches the public `plugin.json` and `CHANGELOG.md` from this repository. Nothing about you or your project is sent. Disable with `SWIFTCRAFT_NO_UPDATE_CHECK=1`.
- **PR review** uses your authenticated GitHub CLI. It only reads until you confirm; it posts a single `COMMENT` review, never approves or merges. The review agent has no shell or write tools, and PR text is treated as untrusted data.
- **Optional setup** (`scripts/setup-engram.js --apply`, `--with-rtk`) installs third-party software only when you run it with those flags.

## Hardening tips

- Review `hooks/hooks.json` and `scripts/` before installing any plugin, including this one.
- Pin to a released tag (`swiftcraft--vX.Y.Z`) if you want to avoid changes from `main`.
