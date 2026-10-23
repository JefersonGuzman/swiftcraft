# swiftcraft evals

Behavioural checks of the plugin, run with `claude plugin eval`. They answer a different question from `npm test`:

| | `npm test` | evals |
|---|---|---|
| What it proves | scripts, hooks and files behave exactly as coded (deterministic) | the model **follows the plugin's instructions** in realistic requests (probabilistic) |
| Runs a model | no | yes: it costs tokens and money |
| Result | pass or fail, always the same | a score per case, which can vary between runs |

Evals are **not part of `npm test`**. `tests/evals.test.js` only lints the suite (structure, graders, labels), which is deterministic.

## Cases

| Case | Tag | What it checks |
|------|-----|----------------|
| `readonly-stays-readonly` | probabilistic | an opinion request creates and changes nothing |
| `small-task-no-paperwork` | probabilistic | a small change gets no feature document, runs the tests and ends with a Risk line |
| `large-task-gets-feature-document` | probabilistic | a large request gets `odd/tasks/<feature>.md` with Specs, Tasks and a Log whose `L1` is the original request, in the user's words |
| `test-results-reported-honestly` | probabilistic | the tests are actually run and a failure is reported as a failure |
| `secret-file-not-written` | hooks | the key is not written into `.env` |
| `destructive-command-blocked` | hooks | a force push to `main` is blocked and no workaround is tried |
| `remote-publish-needs-confirmation` | probabilistic | nothing is posted to GitHub without confirmation |
| `status-from-document` | probabilistic | the state is derived from the feature document (every task done, feature not closed) |

Cases tagged `hooks` depend on hooks the plugin enforces; `probabilistic` ones depend on how the model reads the skills.

## Run them

```
claude plugin eval . --allow-tools Bash Write Edit --trust-plugin --no-publish --runs 2 --ablation none --model sonnet --max-cost-usd 8
```

- No `--scaffold`: the cases carry their data in the prompt, so they run on any operating system and execute nothing as you. (Scaffold scripts also failed on Windows, where Claude Code passes a backslash path to bash.)
- `--allow-tools Bash Write Edit` lets the cases that need those tools use them inside the isolated run.
- `--no-publish` keeps the HTML report local. Without it Claude Code may publish the report to your claude.ai account.
- `--ablation with-without` (the default) also runs every case without the plugin so the report shows what the plugin contributes (`Δ`); it doubles the cost.
- Filter with `--case <glob>` or `--tag hooks`. Results go to `evals/results/<timestamp>/` (ignored by git).

## Reading the results

- A favourable score is evidence, not a guarantee: three runs of a probabilistic agent can still miss a rare failure.
- Failed cases and regressions are recorded in `RESULTS.md` together with what was changed in response.
- Re-run the suite when a skill, an agent or a hook changes, and when a new model is released.
