---
name: architecture-guard
description: Enforce Clean/Hexagonal/Screaming architecture rules. Use when creating modules, layers, adapters, or reviewing where code should live and what may import what.
---

# architecture-guard

## Layout (feature-first, "screaming")

```
src/
  <feature>/            # name says what the business does, not the framework
    domain/             # entities, value objects, domain services, ports (interfaces)
    application/        # use cases, orchestrates domain via ports
    infrastructure/     # adapters: DB, HTTP clients, queues (implements ports)
    presentation/       # controllers, routes, UI components, CLI
  shared/               # tiny, truly cross-feature kernel (no business rules)
  app/                  # composition root: wires adapters to ports, boots the app
```

## Dependency rule

`presentation → application → domain` and `infrastructure → application/domain`.
Never the reverse. `domain` imports nothing from frameworks, I/O, or other layers.

## Decision table

| Need | Put it in |
|------|-----------|
| Business rule / invariant | domain |
| "Do X when Y" flow | application (use case) |
| DB/API/file/clock/random access | port in domain or application, adapter in infrastructure |
| Validation of external input | presentation (shape) + domain (rules) |
| Framework glue, DI | app/ (composition root) |

## UI projects

Atomic design inside `presentation/`: atoms → molecules → organisms → templates → pages. Container components fetch/orchestrate; presentational components are pure props → markup.

## Checks

- One use case = one class/function, one reason to change.
- Cross-feature access goes through the other feature's public API (`index`), never its internals.
- Shared kernel stays small; if it grows business logic, it is a missing feature.
- The `arch-lint` hook flags framework/outer-layer imports inside `domain/` and `application/`. Override with `docs/arch-rules.json`.
