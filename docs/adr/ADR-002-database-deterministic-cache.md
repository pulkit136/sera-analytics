# ADR-002: Database is a Deterministic Cache

## Status
Accepted

## Context
Exposing public query APIs directly to blockchain nodes is slow, expensive, and provides poor search capabilities. However, writing custom databases often introduces side effects, leading to inconsistencies between runs.

## Decision
The relational database acts strictly as a deterministic, disposable cache of block events.
The indexing logic must guarantee that given the same blockchain history input, the resulting database state is identical across all runs.
Aggregations, business rules, and state modifications are prohibited on database writes.

## Consequences
- The database schema stays simple, mirroring raw event parameters.
- Reindexing is fast and highly predictable.
- The cache can be safely scaled horizontally without sync drift.
