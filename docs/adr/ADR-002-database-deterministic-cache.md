# ADR-002: Deterministic PostgreSQL Cache

## Status
Accepted

## Context
Exposing public query APIs directly to blockchain nodes is slow, expensive, and provides poor search capabilities. However, writing custom caching stores often introduces side effects, leading to inconsistencies between runs.

## Decision
The deterministic PostgreSQL cache acts strictly as a deterministic, disposable cache of block events.
The indexing logic must guarantee that given the same blockchain history input, the resulting cache state is identical across all runs.
Aggregations, business rules, and state modifications are prohibited on cache writes.

## Consequences
- The cache schema stays simple, mirroring raw event parameters.
- Reindexing is fast and highly predictable.
- The cache can be safely scaled horizontally without sync drift.
