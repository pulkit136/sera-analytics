# Release Engineering Checklist

Use this checklist to verify production readiness before tagging and pushing a public release of `sera-data`.

---

## Pre-Release Verification

### 1. Static Analysis & Type Checking
Verify code quality and type completeness:
- [ ] Run typescript builder across all workspaces:
  ```bash
  pnpm run build
  ```
- [ ] Run linter and formatter:
  ```bash
  pnpm run lint
  ```

### 2. Testing & Replay
Verify deterministic execution:
- [ ] Run all Vitest suites:
  ```bash
  pnpm run test
  ```
- [ ] **Verify replay from genesis on a clean database**: Wiping the local database cache and starting the indexing pipeline daemon from block Genesis completes without failure, producing an identical database state.

### 3. Migration Integrity
Verify schema updates:
- [ ] Database migrations execute `up` and `down` cleanly.
- [ ] No historical migrations are modified or deleted.

### 4. Container Verification
Verify container builds:
- [ ] Indexer and API Dockerfiles compile without errors:
  ```bash
  docker compose build
  ```

### 5. Documentation
Verify docs are up-to-date:
- [ ] README.md, deployment guides, and ADRs are complete.

### 6. Changelog & Versioning
Coordinate version releases:
- [ ] Build changesets and compile changelogs:
  ```bash
  npx changeset version
  ```
