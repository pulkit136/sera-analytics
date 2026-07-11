# Initial Layer 1 PostgreSQL Schema: Architecture and Design

This document details the PostgreSQL schema layout, indexing justifications, replay strategies, and partitioning guidelines for the **sera-data** Layer 1 event store.

---

## 1. Table Definitions

Every Layer 1 table preserves blockchain metadata (`chain_id`, `block_number`, `block_hash`, `block_timestamp`, `transaction_index`, `tx_hash`, `log_index`) and raw payloads (`raw_topics`, `raw_data`) to ensure complete replayability.

### 1. `raw_deposits`
*   **Purpose:** Captures immutable deposit events from the custody Vault.
*   **Protocol Source:** `Vault.sol` -> `Deposited` event.
*   **Primary Key:** Composite `(tx_hash, log_index, chain_id)`.
*   **Columns:**
    *   `user_address` (`VARCHAR(42)`): lowercase wallet address.
    *   `token_address` (`VARCHAR(42)`): lowercase whitelisted ERC-20.
    *   `amount` (`NUMERIC(78,0)`): 256-bit unsigned token amount.
*   **Indexes:**
    *   `idx_raw_deposits_user`: On `user_address`. Speeds up personal balance history lookups.
    *   `idx_raw_deposits_token`: On `token_address`. Optimizes token volume and TVL tracking.

### 2. `raw_withdrawals`
*   **Purpose:** Captures all withdrawal flows (standard, instant, and emergency requested/executed).
*   **Protocol Source:** `Vault.sol` -> `Withdrawn`, `Sera.sol` -> `InstantWithdraw`, `WithdrawRequested`, `Withdraw`.
*   **Primary Key:** Composite `(tx_hash, log_index, chain_id)`.
*   **Columns:**
    *   `user_address` (`VARCHAR(42)`).
    *   `token_address` (`VARCHAR(42)`).
    *   `amount` (`NUMERIC(78,0)`).
    *   `withdrawal_type` (`VARCHAR(20)`): values are standard, instant, emergency_pending, emergency_executed.
    *   `request_block` (`BIGINT`, nullable): block number where the emergency time-lock was requested.
*   **Indexes:**
    *   `idx_raw_withdrawals_user`: On `user_address`.
    *   `idx_raw_withdrawals_token`: On `token_address`.

### 3. `raw_trades`
*   **Purpose:** Captures Limit Order Match events settled by the matching engine.
*   **Protocol Source:** `Sera.sol` -> `OrderMatched` event.
*   **Primary Key:** Composite `(tx_hash, log_index, chain_id)`.
*   **Columns:**
    *   `order_hash_0`, `order_hash_1` (`VARCHAR(66)`): order signature hashes.
    *   `user_0`, `user_1` (`VARCHAR(42)`): participating trader addresses.
    *   `token_0`, `token_1` (`VARCHAR(42)`): assets exchanged.
    *   `amount_0`, `amount_1` (`NUMERIC(78,0)`): match fill amounts.
    *   `protocol_take_0`, `protocol_take_1` (`NUMERIC(78,0)`): fees collected.
*   **Indexes:**
    *   `idx_raw_trades_user_0`, `idx_raw_trades_user_1`: On user addresses to optimize trader query profiles.

### 4. `raw_swaps`
*   **Purpose:** Captures routed multi-hop swaps.
*   **Protocol Source:** `SeraSOR.sol` -> `IntentMatched` event.
*   **Primary Key:** Composite `(intent_hash, tx_hash, chain_id)`.
*   **Columns:**
    *   `taker_address` (`VARCHAR(42)`).
    *   `leg_count` (`INTEGER`).
*   **Indexes:**
    *   `idx_raw_swaps_taker`: On `taker_address`.

### 5. `raw_swap_legs`
*   **Purpose:** Captures individual hops of routed swaps.
*   **Protocol Source:** `SeraSOR.sol` -> `IntentLegMatched` event.
*   **Primary Key:** Composite `(intent_hash, leg_index, chain_id)`.
*   **Columns:**
    *   `taker_order_hash`, `maker_order_hash` (`VARCHAR(66)`).
*   **Indexes:**
    *   `idx_raw_swap_legs_intent`: On `intent_hash` to rebuild complete paths.

### 6. `raw_failed_matches` & `raw_failed_intents`
*   **Purpose:** Operational diagnostics logs for failing match batches and swaps.
*   **Protocol Source:** `SeraBatcher.sol` -> `MatchFailed`, `IntentFailed`.
*   **Primary Key:** Composite `(tx_hash, log_index, chain_id)`.

---

## 2. Replay and Idempotency Guarantees

*   **Natural Composite Constraints:** No synthetic primary keys are used. Composite primary keys map directly to on-chain log offsets `(tx_hash, log_index, chain_id)`.
*   **Conflict Resolution:** Backfills and replays trigger `ON CONFLICT DO NOTHING`. If a block range is re-indexed, the database ignores duplicates safely.

---

## 3. Future Partitioning Strategy

As the transaction block history grows, high-volume event tables will experience query degradation. We recommend **Range Partitioning** on `block_number`:

*   **Eligible Tables:** `raw_deposits`, `raw_withdrawals`, `raw_trades`, and `raw_swap_legs`.
*   **Partition Range:** Intervals of 1,000,000 blocks (roughly 4.5 months on Ethereum mainnet).
*   **Benefits:** Allows fast partition pruning on date/block range filters and enables archiving of ancient historical partitions to cold storage tables.
