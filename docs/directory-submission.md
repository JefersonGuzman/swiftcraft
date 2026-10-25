# Submitting swiftcraft to Anthropic's directory

Status: prepared, not submitted. The submission is made by the account owner in the developer portal; nobody else can do it for them.

## What the plugin already satisfies (checked)

- `claude plugin validate --strict` passes with no findings.
- The plugin is at the repository root (not a subfolder), so the directory's "scripts the validator couldn't follow" hold for subfolder plugins does not apply.
- License (`LICENSE`, MIT and `license` in `plugin.json`) and a README of well over 40 words.
- 177 tracked files (limit 512), no file over 256 KiB, no lockfile or registry configuration, no `.ico`, `.pdf`, `.zip` or executable, and only one PNG icon plus one JPEG used by the README.
- Every hook command is `node "${CLAUDE_PLUGIN_ROOT}/..."`; no package launcher (`npx`, `uvx`, ...) is used anywhere.
- Manifest metadata: `icon`, `documentationUrl`, `supportUrl`, `privacyPolicyUrl`; `PRIVACY.md` and the README section "What the plugin runs, sends and fetches" disclose everything it runs, sends or fetches. `tests/directory-submission.test.js` keeps these true.

## Steps only the account owner can do

1. Confirm a **paid claude.ai plan** (Pro or Max from your own account; on Team or Enterprise an Owner submits).
2. Open `claude.ai/directory/manage`, choose **Submit new**, then **Plugin bundle**.
3. On **Source**, enter the repository `JefersonGuzman/swiftcraft` (the plugin folder is the repository root) and press **Validate**.
4. Fix every finding marked **Blocks**, push, and press **Re-validate**. A **Policy hold** is not a rejection: a reviewer reads that version before it goes live.
5. Complete the rest of the form (listing text, contact details, the policy agreement) and submit. Review and the security scan happen after you submit; each new commit the directory follows is scanned again.

Because a published plugin is identified by its `name`, `swiftcraft` is permanent once listed (see the plugin publishing guide). The portal checks whether the name is already taken and whether it may be confused with another listing.

## Things a reviewer or the scan may flag (honest list)

- The update notice makes a network request on every session start (cached for 24 hours). It is disclosed and can be turned off.
- `setup-engram.js --apply` and `--with-rtk` install third-party software and change Claude Code configuration, but only when the user runs them with those flags. This is the most likely thing to receive a **Policy hold**.
- Several hooks read the user's prompts and commands locally to apply rules. They send nothing anywhere, but a scanner may flag the behavior.
- Components that only work in Claude Code (hooks, scripts that call `git`, `gh` and `claude`) do not load on claude.ai or in Cowork; the skills, agents and commands may. Which parts load there is **Not verified**; check the platform support table before promising it.

## Not verified

- The portal's own validation and the security scan have not been run: only `claude plugin validate --strict` was.
- Whether the name `swiftcraft` is free in the directory, and how a reviewer will treat the optional installs.
- How the plugin behaves when loaded from the directory on claude.ai or in Cowork.
- Review time and outcome.
