# Stack: Next.js (App Router) + TypeScript

Feature-sliced, with Hexagonal inside each feature. `app/` only routes.

```
src/
  app/                      routes, layouts, route handlers — THIN, no business logic
  features/<feature>/
    domain/                 entities, value objects, ports (pure TypeScript)
    application/            use cases (server actions call these)
    infrastructure/         DB/API adapters (Prisma, fetch, etc.)
    ui/                     feature components (containers + presentational)
    index.ts                public API of the feature
  shared/
    ui/                     design system: atoms, molecules, organisms (atomic design)
    lib/                    framework-free helpers
    config/                 env parsing (validated once)
  composition/              wiring adapters to ports (DI)
```

## Rules

- `app/**` imports from `features/*/index.ts` and `shared/*` only.
- `domain/` and `application/` never import `react`, `next/*`, Prisma, or `fetch` wrappers.
- Server Components fetch via use cases; Client Components receive props (presentational) or call server actions.
- `"use client"` only at the leaf that needs interactivity.
- One feature never imports another feature's internals; use its `index.ts`.

## Commands (typical)

- Test: `npm test` (Vitest/Jest) · Lint: `npm run lint` · Types: `npx tsc --noEmit` · Build: `npm run build`

## Test levels

Domain/application: unit (no mocks except ports). Adapters: integration. UI: component tests + a few Playwright flows.
