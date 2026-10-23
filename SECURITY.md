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

## Command guard: what it does and what it does not

The `PreToolUse` command guard (Bash and PowerShell) blocks a short list of catastrophic commands (**deny**) and asks you to confirm a list of risky ones (**ask**); see the README for the tables. Be clear about its limits:

- It analyzes the command **text** statically. It does not expand variables, globs, aliases or scripts it does not see, so it has **false negatives** (something dangerous slips through) and **false positives** (a harmless command is questioned).
- Known gaps: obfuscated command names (for example `r\m`), writes to system files such as `/etc/passwd`, anything produced by a script or program it cannot read, and variables or globs it cannot expand. It is built to catch accidents, not a determined attacker.
- It **does not replace** Claude Code's permission rules, sandboxing or the operating system's own controls (file permissions, user accounts, backups). Keep those in place.
- Deny rules cannot be relaxed by a project file; ask rules can. If you need a denied command, run it yourself in a terminal.
- Its local log stores only the decision and the rule ids, never the command text.

Report guard bypasses (a dangerous command that is not caught) through the private channel above.

## Verifying a release

Each release published by the workflow carries a source archive (`swiftcraft-X.Y.Z.tar.gz`), a `SHA256SUMS` file and a build provenance attestation created by GitHub Actions. To check a download:

```bash
sha256sum -c SHA256SUMS
gh attestation verify swiftcraft-X.Y.Z.tar.gz --repo JefersonGuzman/swiftcraft
```

Status: verified on release 0.6.0 (the first to use it): the workflow attached the archive and `SHA256SUMS`, the checksum matched a fresh download, and `gh attestation verify` succeeded. Prerelease (beta) tags have not been published yet, so that path is not verified. A checksum published next to the archive proves the download is intact, not that the project is trustworthy: review the code you install.

## Hardening tips

- Review `hooks/hooks.json` and `scripts/` before installing any plugin, including this one.
- Pin to a released tag (`swiftcraft--vX.Y.Z`) if you want to avoid changes from `main`.
