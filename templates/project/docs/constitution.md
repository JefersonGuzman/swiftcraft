# Constitution — {{PROJECT_NAME}}

Non-negotiable rules. Change only through an ADR.

## Product
{{ONE_LINE_PRODUCT}}

## Stack
{{STACK}}

## Principles

1. **Spec before code.** No feature without an approved `spec.md`.
2. **Dependency rule.** `domain` ← `application` ← `infrastructure`/`presentation`. Inner layers never import outer ones or frameworks.
3. **Screaming structure.** Top-level folders name business features, not technologies.
4. **Tests first** for behavior; assert observable effects through public interfaces.
5. **Small steps.** One task, one reviewable commit (~400 changed lines max).
6. **Decisions are written.** Hard-to-reverse choices get an ADR.
7. **No secrets in the repo.** Config via environment; commit `.env.example` only.
8. **Docs move with code.** README/help/ADRs updated in the same change.

## Definition of done

Tests and lint pass (real output seen) · diff reviewed · tasks.md updated · docs updated.
