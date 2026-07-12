# ADR-001: Blockchain is the Source of Truth

## Status
Accepted

## Context
In decentralized networks, blockchain state is immutable and represents the absolute historical fact record. A local database is subject to data corruption, schema changes, and replication delays.

## Decision
We establish that the blockchain is the single source of truth for the platform.
All database records must be constructed strictly by decoding and normalizing raw blockchain logs.
The application logic must never treat the local database as the primary source of truth.

## Consequences
- The database can be entirely wiped and reconstructed from genesis at any time.
- All normalizers and write operations must be stateless and repeatable (idempotent).
- Any database sync anomalies are resolved by checking blockchain RPC states.
