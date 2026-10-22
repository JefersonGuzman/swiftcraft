# Architecture — {{PROJECT_NAME}}

Variant: feature-first Hexagonal (Clean + Screaming).

```
src/
  <feature>/
    domain/           entities, value objects, ports
    application/      use cases
    infrastructure/   adapters (DB, HTTP, queues)
    presentation/     controllers / routes / UI / CLI
  shared/             minimal cross-feature kernel
  app/                composition root (wiring, bootstrap)
specs/                spec.md, plan.md, tasks.md per feature
docs/adr/             decision records
```

## Rules

- `domain` has zero framework/I-O imports. `application` depends on `domain` only.
- Cross-feature calls go through the feature's public entry (`index`), never its internals.
- Wiring happens only in `app/`.
- Enforced by the plugin hook `arch-lint`; tune via `docs/arch-rules.json`.

## Features

| Feature | Purpose | Spec |
|---------|---------|------|
| _none yet_ | | |

## Decisions

See `docs/adr/`.
