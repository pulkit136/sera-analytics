# ADR-003: Canonicality Belongs to Blocks

## Status
Accepted

## Context
Blockchain reorganizations (reorgs) cause blocks to be orphaned. If we store canonicality flags on every individual log fact table, handling a reorg requires updating thousands of rows, which is slow and prone to race conditions.

## Decision
Canonicality belongs strictly to blocks.
The `block_metadata` table holds the `is_canonical` status flag.
All read queries for log facts (deposits, trades, etc.) must perform an `innerJoin` against the `block_metadata` table on `(chain_id, block_number, block_hash)` where `is_canonical = true`.

## Consequences
- Handling a reorg rollback only requires modifying a single row in the `block_metadata` table.
- Raw fact data is kept immutable; no updates are executed on fact tables.
- Read queries automatically filter out orphaned block events.
