# Database Schema Migrations: Layer 1

This document explains the initial database schema migration set for Layer 1 (Protocol Records) and how it maps back directly to the **Event-to-Fact Specification**.

---

## 1. Migration Mappings to Event-to-Fact Specification

Every table in this migration directly mirrors the immutable facts established by protocol log events:

### 1. `raw_deposits` (derived from `Deposited`)
*   **Facts Captured:** `token_address`, `user_address`, `amount`.
*   **Metadata:** `chain_id`, `block_number`, `block_hash`, `block_timestamp`, `transaction_index`, `tx_hash`, `log_index`.
*   **Upgrade Preservation:** Stores `raw_topics TEXT[]` and `raw_data BYTEA` containing raw hex logs.
*   **Indexing Constraints:** Primary Key on `(tx_hash, log_index, chain_id)` ensures log duplication safety.

### 2. `raw_withdrawals` (derived from standard and emergency withdrawal events)
*   **Facts Captured:** `token_address`, `user_address`, `amount`, `withdrawal_type` (e.g., standard, instant, emergency_pending, emergency_executed), `request_block`.
*   **Metadata:** Full block metadata and raw topics/data payloads.
*   **PrimaryKey:** `(tx_hash, log_index, chain_id)`.

### 3. `raw_trades` (derived from `OrderMatched`)
*   **Facts Captured:** `order_hash_0`, `order_hash_1`, matching users (`user_0`, `user_1`), matched tokens (`token_0`, `token_1`), raw volumes (`amount_0`, `amount_1`), and fees taken (`protocol_take_0`, `protocol_take_1`).
*   **Metadata:** Full block metadata and raw topics/data.
*   **PrimaryKey:** `(tx_hash, log_index, chain_id)` (or derived `trade_id` representation).

### 4. `raw_swaps` (derived from `IntentMatched`)
*   **Facts Captured:** `intent_hash`, `taker_address`, `leg_count`.
*   **Metadata:** Full block metadata and raw topics/data.
*   **PrimaryKey:** `(intent_hash, tx_hash, chain_id)`.

### 5. `raw_swap_legs` (derived from `IntentLegMatched`)
*   **Facts Captured:** `intent_hash`, `leg_index`, `taker_order_hash`, `maker_order_hash`.
*   **Metadata:** Basic block metrics.
*   **PrimaryKey:** `(intent_hash, leg_index, chain_id)`.

### 6. `raw_failed_matches` (derived from `MatchFailed`)
*   **Facts Captured:** failing order hashes, revert `reason`, batch execution queues.
*   **PrimaryKey:** `(tx_hash, log_index, chain_id)`.

### 7. `raw_failed_intents` (derived from `IntentFailed`)
*   **Facts Captured:** failed `intent_index`, revert `reason`.
*   **PrimaryKey:** `(tx_hash, log_index, chain_id)`.

---

## 2. Replay and Idempotency Semantics

1.  **Strict Transaction Boundaries:** When executing migration tasks, Kysely processes tables inside isolation scopes.
2.  **No Foreign Keys Across Fact Tables:** Because events are received asynchronously in batches, fact tables are decoupled from foreign key constraints. This prevents insertion locks and simplifies parallel processing.
3.  **Conflict Prevention:** All tables use composite primary keys tied to on-chain coordinates. Retrying block intervals triggers `ON CONFLICT DO NOTHING`, guaranteeing that records are never duplicated.
