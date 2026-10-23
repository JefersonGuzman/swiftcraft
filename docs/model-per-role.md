# Model per agent role

Status: not enabled

No swiftcraft agent pins a model today: every agent runs on whatever your session uses. This page records what is known, what is a hypothesis, and how to validate it before anything is pinned.

## What Claude Code supports

An agent file may set `model:` in its frontmatter: `sonnet`, `opus`, `haiku`, `fable`, a full model ID (the same values `--model` accepts) or `inherit`. When it is omitted, Claude Code resolves the model in this order: the model Claude passes for that call, the frontmatter `model`, `CLAUDE_CODE_SUBAGENT_MODEL` if set, then the main conversation's model.

Not verified: that `model:` is honored for agents shipped inside a plugin. The documentation lists the fields plugin agents ignore (`hooks`, `mcpServers`, `permissionMode`) and `model` is not among them, but that is an inference, not a test.

## Hypothesis (not a recommendation)

| Role | Needs | Candidate | Why it is only a hypothesis |
|------|-------|-----------|-----------------------------|
| `explorer` | fast, cheap lookups | a smaller model | quality of the map has not been compared |
| `reviewer`, `pr-reviewer` | careful reading, few false findings | a stronger model | false-positive rate has not been measured |
| `architect` | design tradeoffs | a stronger model | not measured |

Until measured, the safe default is to inherit your session's model. You can already override it yourself without editing the plugin: set `CLAUDE_CODE_SUBAGENT_MODEL` for all subagents, or switch the session model.

## How to validate before pinning

1. Pick the role and a small fixed set of cases (for `reviewer`: a diff with known planted defects; for `explorer`: questions with known answers).
2. Run each case several times per candidate model, for example `claude plugin eval . --model sonnet` and again with `--model` set to the candidate (see `evals/README.md`).
3. Record quality (planted defects found, false findings), latency and cost per model in this page.
4. Pin a model only if the cheaper candidate matches quality on those cases, and change the status line above to `Status: validated` listing the evidence. `tests/models.test.js` refuses a pinned model while the status is `not enabled`.
