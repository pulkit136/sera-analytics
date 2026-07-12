# ADR-004: Layer Separation

## Status
Accepted

## Context
Mixing deterministic PostgreSQL cache configurations, transaction logic, API routing, and indexing loops makes code testing difficult and leads to architectural coupling.

## Decision
We enforce a strict separation of concerns into isolated monorepo layers:
1. **Contracts (`@sera/contracts`)**: Smart contract configurations, decoders, and normalizers.
2. **Cache (`@sera/database`)**: Schema mapping, migrations, and Kysely writing mechanisms.
3. **Query (`@sera/query`)**: Read-only interfaces encapsulating Kysely.
4. **Transport (`apps/api`)**: HTTP routing and Fastify controllers.
5. **Indexer (`apps/indexer`)**: Continuous loop coordinator.

## Consequences
- Lower layers have no knowledge of higher layers (e.g. `@sera/query` has no fastify or api dependencies).
- Each layer is isolated and testable in isolation using unit tests and mock dependencies.
