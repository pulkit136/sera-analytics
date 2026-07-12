## Description

Provide a summary of the changes introduced by this pull request.

## Related Issues
Closes # (issue number)

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Refactoring / Documentation

## PR Checklist (Architectural Validation)
Please verify that you have met all project guidelines before submitting this PR:
- [ ] All indexing and replay behaviors remain unchanged.
- [ ] No repository write pathways or event normalizers have been altered.
- [ ] Any new read queries perform an `innerJoin` against `block_metadata` where `is_canonical = true`.
- [ ] The `@sera/query` package remains isolated and contains no HTTP/Fastify dependencies.
- [ ] The `apps/api` package contains no database or Kysely dependencies and interacts solely through the query layer.
- [ ] All package compiles complete successfully (`pnpm run build`).
- [ ] All tests run and pass cleanly (`pnpm run test`).
- [ ] Code formatting and quality guidelines pass Biome verification.
