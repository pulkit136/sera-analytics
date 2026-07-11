# Database Persistence Design

The `RecordRepository` is responsible for writing normalized relational records (`NormalizedRecord`) into the permanent database storage. It acts as the sink layer of the data pipeline.

---

## 1. Why Persistence is Isolated from Normalization

By isolating database writes from normalization, we separate **domain logic** from **infrastructure logic**:

*   **Single Responsibility:** The normalizer only knows how to extract and shape values from EVM events. The repository only knows how to build SQL statements, manage connections, and execute batch inserts.
*   **Decoupled Scaling:** If database write performance becomes a bottleneck, we can optimize the repository (e.g. by implementing bulk copy, raw query batching, or query parallelization) without touching event parsing or business translation rules.
*   **Testing Velocity:** Normalization tests can run fully synchronously without mock databases, connection managers, or SQL parsers. In turn, database tests can focus entirely on constraints, transaction boundaries, and upsert syntax.

---

## 2. How Deterministic Replay is Achieved

The platform guarantees **idempotency** so that replaying a range of blocks multiple times yields the exact same state without producing duplicate records. This is achieved via:

1.  **Composite Primary Keys:** Table keys are tied strictly to on-chain source identifiers:
    *   `deposits`: `(tx_hash, log_index)`
    *   `withdrawals`: `(tx_hash, log_index)`
    *   `swaps`: `(intent_hash, tx_hash)`
2.  **Deterministic Row Identifiers:** Primary keys like `trade_id` and `fill_id` are derived deterministically by hashing or formatting transaction parameters (`${tx_hash}_${log_index}`).
3.  **Conflict Handling (`ON CONFLICT`):**
    *   For event-based logs (trades, deposits, swaps), conflicts trigger `DO NOTHING`. If a log is reprocessed, PostgreSQL rejects the write silently, and the repository registers it as skipped.
    *   For stateful properties (users, withdrawals), conflicts trigger `DO UPDATE SET`. This ensures that last active timestamps or timelock states stay accurate even if backfilled.
4.  **Transaction Boundaries:** All writes inside `saveRecords` execute within a single transaction block. If one insert fails, PostgreSQL rolls back all modifications, ensuring block boundaries are written atomically or not at all.

---

## 3. Why Repositories Never Contain Protocol-Specific Logic

The repository deals exclusively with `NormalizedRecord` objects. It is completely blind to:
*   Ethereum contract ABIs.
*   EVM block numbers or confirmations.
*   Viem client instances.
*   Off-chain signature verification.

This isolation prevents domain leakage. If the Sera protocol releases a new smart contract update or changes an event signature, only the parser (`EventDecoder`) and mapper (`EventNormalizer`) packages require updates. The database repository remains unchanged because the underlying data schema is stable.

---

## 4. Swapping the Database Engine

Because upstream components interact with the database solely through the `RecordRepository` interface, the indexer is storage-agnostic. 

If we choose to replace PostgreSQL with another system in the future, we can write a new implementation of `RecordRepository`:

```
                       +-------------------------+
                       |    RecordRepository     |
                       |       (Interface)       |
                       +-------------------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
            v                                               v
+-----------------------+                       +-----------------------+
| KyselyRecordRepository|                       |ClickHouseRepository   |
| (PostgreSQL Driver)   |                       | (OLAP analytical sink)|
+-----------------------+                       +-----------------------+
```

### Transitioning is seamless:
1.  Write a `ClickHouseRecordRepository` that implements `RecordRepository`.
2.  Swap the dependency injection target in the indexer orchestrator config.
3.  No changes are required in `EventDecoder`, `EventNormalizer`, or the synchronization orchestrator loop!
