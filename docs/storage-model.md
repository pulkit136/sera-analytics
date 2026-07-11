# Storage Model Specification & Decision Matrix

This document defines the finalized database storage model for the `sera-data` platform. It specifies the separation between Layer 1 (raw protocol facts) and Layer 2 (asynchronous metadata), audits all database constraints and indexes, and details the core architectural design decisions.

---

## 1. Storage Architecture Overview

The database design adheres strictly to the separation of ingestion facts from derived projections.

```mermaid
flowchart TD
    subgraph Layer 1: Protocol Facts (Immutable)
        raw_deposits
        raw_withdrawals
        raw_trades
        raw_order_fills
        raw_swaps
    end
    subgraph Layer 2: Metadata (Asynchronous)
        token_metadata
        metadata_queue
    end
    subgraph Ingestion & Replay (Operational)
        checkpoints
        block_metadata
    end
    raw_order_fills -->|fk| raw_trades
```

---

## 2. Table-by-Table Ownership & Index Audit

### raw_deposits
*   **Layer:** Layer 1 (Immutable Protocol Facts)
*   **Owner:** Ingestion Pipeline
*   **Repository:** `KyselyRecordRepository`
*   **PrimaryKey:** `(tx_hash, log_index, chain_id)`
*   **Unique Constraints:** `(tx_hash, log_index, chain_id)`
*   **Foreign Keys:** None
*   **Indexes:**
    *   `idx_raw_deposits_user` (`user_address`): Speeds up user deposit history lookups.
    *   `idx_raw_deposits_token` (`token_address`): Speeds up token volume aggregates.
*   **Replay Invariant:** `ON CONFLICT (tx_hash, log_index, chain_id) DO NOTHING`.

### raw_withdrawals
*   **Layer:** Layer 1 (Immutable Protocol Facts)
*   **Owner:** Ingestion Pipeline
*   **Repository:** `KyselyRecordRepository`
*   **PrimaryKey:** `(tx_hash, log_index, chain_id)`
*   **Unique Constraints:** `(tx_hash, log_index, chain_id)`
*   **Foreign Keys:** None
*   **Indexes:**
    *   `idx_raw_withdrawals_user` (`user_address`): Speeds up user withdrawal lookups.
    *   `idx_raw_withdrawals_token` (`token_address`): Speeds up token outflow lookups.
*   **Replay Invariant:** `ON CONFLICT (tx_hash, log_index, chain_id) DO NOTHING`.

### raw_trades
*   **Layer:** Layer 1 (Immutable Protocol Facts)
*   **Owner:** Ingestion Pipeline
*   **Repository:** `KyselyRecordRepository`
*   **PrimaryKey:** `(tx_hash, log_index, chain_id)`
*   **Unique Constraints:** `(tx_hash, log_index, chain_id)`
*   **Foreign Keys:** None
*   **Indexes:**
    *   `idx_raw_trades_user_0` (`user_0`): Speeds up limit order user trade history.
    *   `idx_raw_trades_user_1` (`user_1`): Speeds up limit order user trade history.
*   **Replay Invariant:** `ON CONFLICT (tx_hash, log_index, chain_id) DO NOTHING`.

### raw_order_fills
*   **Layer:** Layer 1 (Immutable Protocol Facts)
*   **Owner:** Ingestion Pipeline
*   **Repository:** `KyselyRecordRepository`
*   **PrimaryKey:** `(fill_id)`
*   **Unique Constraints:** None
*   **Foreign Keys:**
    *   `(tx_hash, log_index, chain_id)` -> `raw_trades(tx_hash, log_index, chain_id)` ON DELETE CASCADE.
*   **Indexes:**
    *   `idx_raw_order_fills_order` (`order_hash`): Optimizes order history & remaining amount queries.
*   **Replay Invariant:** `ON CONFLICT (fill_id) DO NOTHING`.

### raw_swaps
*   **Layer:** Layer 1 (Immutable Protocol Facts)
*   **Owner:** Ingestion Pipeline
*   **Repository:** `KyselyRecordRepository`
*   **PrimaryKey:** `(intent_hash, tx_hash, chain_id)`
*   **Unique Constraints:** `(intent_hash, tx_hash, chain_id)`
*   **Foreign Keys:** None
*   **Indexes:**
    *   `idx_raw_swaps_taker` (`taker_address`): Speeds up swap history search.
*   **Replay Invariant:** `ON CONFLICT (intent_hash, tx_hash, chain_id) DO NOTHING`.

### token_metadata
*   **Layer:** Layer 2 (Asynchronous Metadata)
*   **Owner:** Metadata Pipeline
*   **Repository:** `KyselyMetadataRepository`
*   **PrimaryKey:** `(chain_id, token_address)`
*   **Unique Constraints:** None
*   **Foreign Keys:** None
*   **Indexes:**
    *   `idx_token_metadata_observed` (`block_number_observed`): Optimizes block observation pruning.
*   **Replay Invariant:** `ON CONFLICT (chain_id, token_address) DO UPDATE SET name = EXCLUDED.name, symbol = EXCLUDED.symbol, decimals = EXCLUDED.decimals`.

---

## 3. Schema Decision Matrix

| Decision | Status | Reason |
| :--- | :--- | :--- |
| **Canonicality on blocks** | **Frozen** | Replay safety. Canonicality is resolved strictly via `block_metadata` joins. No protocol tables store canonicality flags. |
| **Protocol records immutable** | **Frozen** | Determinism. Protocol records represent historical on-chain facts and cannot change after execution. |
| **Metadata async** | **Frozen** | Separation of concerns. Metadata enrichment runs in a separate pipeline, decoupling log ingestion from RPC metadata dependencies. |
| **USD storage** | **Rejected** | Derived data. Exchange rates change over time and are calculated at the query layer rather than stored inline with immutable protocol facts. |
| **User table** | **Rejected** | Application concern. Activity logs are transactional, and user profiles/activity summaries are compiled downstream, keeping Layer 1 metadata-free. |
| **Analytics in indexer** | **Rejected** | Layer separation. The indexer is designed to ingest and write raw facts; metrics and aggregates are computed downstream via views or analytical layers. |
