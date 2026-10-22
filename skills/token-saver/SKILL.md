---
name: token-saver
description: Cut token usage in long or tool-heavy sessions (tool output, file reads, context growth, reply length). Use when a session feels expensive, before large exploration or test/build runs, or when the user asks to save tokens.
---

# token-saver

Biggest lever first. Output of tools and file reads dominate cost, not reply prose.

## 1. Compress tool output (largest win)

- Prefer **RTK** (`rtk` CLI proxy, hook rewrites Bash commands such as `git status` to `rtk git status`). Check with `/swiftcraft:setup`; verify savings with `rtk gain`.
- Caveat: the hook only affects Bash. Built-in Read/Grep/Glob are not compressed, so for large outputs use `rtk read`, `rtk grep`, `rtk find` via Bash.
- Compressed output can hide a rare warning. If a result looks too clean, re-run the raw command once.

## 2. Read less

- Search first, then read line ranges. Never read a whole large file to find one symbol.
- Read a file once; remember it instead of re-reading.
- Bound command output yourself: `--stat`, `-n`, `| tail`, counts, `--quiet` flags.
- Run long test/build suites in a subagent and bring back only failures and totals.

## 3. Keep context small

- One task per turn; stop after verifying it (`tdd-loop`).
- Delegate broad exploration to the `explorer` agent (returns ~30 lines).
- Persist state to `tasks.md`, ADRs and memory so a fresh session can resume instead of dragging history (`context-hygiene`, `memory`).
- Do not paste large logs or files into chat; reference paths.

## 4. Shorter replies (smallest win, ~5-15% end to end)

- Lead with the answer; no recap of what the user just said; no option menus without a real fork.
- Optional: the `caveman` skill for terse prose. Output tokens are a small share of total cost, so do not expect more than single-digit to low-double-digit savings.

## 5. Model and effort

- Use a smaller model/lower effort for mechanical edits and exploration; keep the strongest for design and hard debugging.

## Do not

- Truncate output that you need to see to verify a claim.
- Skip tests or reviews to save tokens; trim input, not verification.
