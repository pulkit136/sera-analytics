# Checkpoint Storage Design

The `CheckpointStore` is responsible for saving and reading the synchronization progress of indexer pipelines. It records the block height that has been successfully committed to the database.

---

## 1. Why Checkpoints are Operational Metadata

Operational metadata is data that tracks the execution state of the indexing engine itself, rather than reflecting on-chain protocol state:

*   **Distinct Separation:** Entities like `trades`, `deposits`, and `swaps` represent the business state of the Sera Protocol. In contrast, checkpoints represent the progress of our indexer workers.
*   **Decoupled Lifecycles:** Business data is immutable and persists forever. Operational metadata (checkpoints) is transient and updated constantly as the head of the chain advances.
*   **Infrastructure Independence:** Since checkpoints are operational metadata, they reside in a single table that doesn't reference core protocol entities. This prevents foreign key constraints from blocking checkpoint updates.

---

## 2. Why Checkpoints are Isolated from the Pipeline

*   **Boundary Separation:** The indexing pipeline is a pure data transformer: it fetches logs, decodes them, normalizes them, and writes the output. It does not know or care *how* progress is tracked.
*   **Flexible Execution:** By isolating checkpoint logic, the same pipeline can be executed in different modes:
    *   **Live Mode:** Updates checkpoints in Postgres after every block batch write.
    *   **Replay/Backfill Mode:** Executes over historic blocks without updating checkpoints, or starting from arbitrary blocks without changing the production checkpoint.
    *   **Dry Run Mode:** Decodes and normalizes events without writing records or updating checkpoints.

---

## 3. Advancing Only After Successful Persistence

To guarantee **crash safety** and **zero data loss**, checkpoints must only advance *after* a database transaction succeeds:

```
[Fetch Block Range] -> [Decode Logs] -> [Normalize] -> [Write DB Records] -> [Save Checkpoint]
                                                             |                    |
                                                      (Transact Commit)    (Advance Progress)
```

If a power failure or database crash occurs *during* write operations:
*   The business records transaction rolls back.
*   The checkpoint is NOT advanced.
*   Upon restart, the indexer queries the checkpoint store, sees the last known safe block, and resumes from there.
*   Because writes are idempotent, reprocessing a partially written block range does not create duplicate entries.

---

## 4. Replay, Crash Recovery, and Reorg Support

1.  **Crash Recovery:** On indexer startup, the worker queries `getCheckpoint(indexerName, chainId)`. If it returns a value, the indexer resumes starting from `latest_indexed_block + 1`. If `null`, it falls back to the configured `startBlock`.
2.  **Replays:** To recalculate analytics or repair schemas, a developer can update `latest_indexed_block` in the checkpoints table back to a specific block height. The indexer will cleanly re-sync and overwrite records idempotently.
3.  **Chain Reorgs:** When a chain reorganization is detected (e.g. by comparing parent hash mismatch):
    *   The orchestrator deletes database records written after the fork block height.
    *   It updates the checkpoint back to the fork height: `saveCheckpoint(name, chainId, forkBlock)`.
    *   The indexer resumes normal operations on the new canonical fork.
