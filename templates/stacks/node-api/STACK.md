# Stack: Node.js API (TypeScript, Hexagonal)

Framework-agnostic core; Express/Fastify/Nest live only in `presentation`.

```
src/
  <feature>/
    domain/               entities, value objects, domain errors, ports (interfaces)
    application/          use cases, DTOs
    infrastructure/       repositories (SQL/ORM), HTTP clients, queues
    presentation/         routes/controllers, request validation (zod), serializers
    index.ts              public API
  shared/                 result type, logger port, id/clock ports
  app/
    container.ts          composition root (build adapters, inject into use cases)
    server.ts             boots the framework
tests/                    mirrors src/, plus tests/e2e/
```

## Rules

- `domain` has zero imports from frameworks, ORM, or Node I/O.
- Controllers translate HTTP <-> use case input/output; no business rules.
- Errors: domain errors map to HTTP status in `presentation` only.
- Config is parsed and validated once in `shared/config`; never read `process.env` elsewhere.
- Time, randomness and IDs come through ports so tests are deterministic.

## Commands (typical)

- Test: `npm test` · Lint: `npm run lint` · Types: `npx tsc --noEmit` · Build: `npm run build`

## Test levels

Unit for domain/application; integration for repositories (real DB in container); a few e2e through HTTP.
