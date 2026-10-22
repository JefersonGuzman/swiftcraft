# Stack: Python + FastAPI (Hexagonal)

```
src/<package>/
  <feature>/
    domain/               dataclasses/pydantic-free entities, value objects, ports (Protocol/ABC)
    application/          use cases (plain functions or classes)
    infrastructure/       SQLAlchemy repos, HTTP clients, queue adapters
    presentation/         FastAPI routers, request/response schemas (pydantic)
  shared/                 clock/id ports, result types
  app/
    container.py          composition root (build adapters, inject)
    main.py               creates the FastAPI app, includes routers
tests/                    mirrors src/, plus tests/e2e/
pyproject.toml
```

## Rules

- `domain` and `application` never import `fastapi`, `sqlalchemy`, `requests`, `pydantic` models used for transport.
- Pydantic schemas live in `presentation`; map to domain objects at the boundary.
- Dependencies are injected with `Depends(...)` that return use cases built in `container.py`.
- Settings via `pydantic-settings` read once in `shared/config.py`.
- Type everything; run mypy/pyright in CI.

## Commands (typical)

- Test: `pytest -q` · Lint: `ruff check .` · Format: `ruff format .` · Types: `mypy src`

## Test levels

Unit for domain/application (fast, no I/O); integration for repositories; API tests with `TestClient`.
