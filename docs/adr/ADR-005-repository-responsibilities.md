# ADR-005: Repository Responsibilities

## Status
Accepted

## Context
Decoupling metadata discovery from hot-path block event indexing is critical to maintain indexing throughput and prevent RPC connection bottleneck delays.

## Decision
The indexing engine writes raw blockchain events strictly as they are observed.
The metadata discovery pipeline runs as a separate queue processor, observing token additions asynchronously.
Database updates are constrained to metadata tables, leaving L1 event tables write-once and append-only.

## Consequences
- Event sync performance remains extremely fast.
- Slow on-chain metadata lookups (e.g. fetching ERC20 name/decimals) never block event ingestion.
- The system tolerates transient RPC failures on metadata extraction.
