# Contributing Guidelines

Thank you for your interest in contributing to `sera-data`! This document outlines local setups, coding standards, testing patterns, and pull request expectations.

---

## 1. Local Development Lifecycle

Follow these steps to compile and run the project locally:

```bash
# 1. Setup local environment
cp .env.example .env

# 2. Install workspace dependencies
pnpm install

# 3. Start local Postgres service
docker compose up postgres -d

# 4. Compile all workspace packages
pnpm run build

# 5. Run tests
pnpm run test
```

---

## 2. Coding & Quality Standards

- **Linting & Formatting**: We use **Biome** for fast, integrated code quality. Run `pnpm run lint` to check for rule violations, and `pnpm run lint:fix` to auto-format changes.
- **TypeScript Rules**: Avoid the use of `any` types unless casting raw cache rows. Prefer strict type safety.
- **Testing**: All functional changes must be covered by unit tests in Vitest. colocate tests alongside their implementation files (`*.test.ts`).

---

## 3. Guide to Adding Features

### Adding Protocol Events
1. Define the event interface inside `@sera/contracts`.
2. Add ABI event decoding rules inside `@sera/contracts` decoders.
3. Update the event normalizer to construct the raw fact model.

### Adding Deterministic PostgreSQL Cache Migrations
1. Create a new migration file under `packages/database/src/migrations/`.
2. Name the file using the format `YYYYMMDDHHMMSS_description.ts`.
3. Export an `up` and `down` function using Kysely.
4. Run migrations using the test runner or daemon.

### Adding Query Methods
1. Define the read model interface inside `@sera/query` (e.g. `DepositQueries.ts`).
2. Add the method signature to the query area interface.
3. Implement the query inside the respective Kysely class, joining with `block_metadata` on canonical block limits.
4. Export the method cleanly from `index.ts`.

---

## 4. Before Opening a PR

Ensure you have completed this architectural validation checklist before submitting your pull request:

- [ ] All indexing and replay behaviors remain unchanged.
- [ ] No repository write pathways or event normalizers have been altered.
- [ ] Any new read queries perform an `innerJoin` against `block_metadata` where `is_canonical = true`.
- [ ] The `@sera/query` package remains isolated and contains no HTTP/Fastify dependencies.
- [ ] The `apps/api` package contains no deterministic PostgreSQL cache or Kysely dependencies and interacts solely through the query layer.
- [ ] All package compiles complete successfully (`pnpm run build`).
- [ ] All tests run and pass cleanly (`pnpm run test`).
- [ ] Code formatting and quality guidelines pass Biome verification.
