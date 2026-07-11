# End-to-End Indexing Pipeline Design

The `IndexingPipeline` coordinates block planning, event log fetching, decoding, mapping, and database updates into a single execution transaction. It is the high-level orchestration interface of the indexer.

---

## 1. Complete Indexing Flow Diagram

```
+-----------------------------------------------------------------+
|                    IndexingPipeline.execute()                   |
+-----------------------------------------------------------------+
                                |
                                v
                   1. Get Block Head from node
                                |
                                v
                   2. Compute Sync Range Targets
                                |
                                v
                     [ Work to do in range? ]
                            /        \
                          No          Yes
                          /            \
                         v              v
                  [Early Exit]   3. Fetch Logs from RPC
                                        |
                                        v
                                 4. Decode ABI Logs
                                        |
                                        v
                               5. Normalize Events
                                        |
                                        v
                               6. Persist Records to DB
                                        |
                                        v
                               7. Output IndexingResult
```

---

## 2. Strict Single Responsibility Layers

Each sub-component behaves as an isolated unit with clear design boundaries:

| Layer / Component | Package | Primary Responsibility |
| :--- | :--- | :--- |
| **SyncPlanner** | `shared` | Computes start/end block boundaries using math rules. |
| **BlockchainReader** | `contracts` | Fetches JSON-RPC logs; translates Viem errors. |
| **EventDecoder** | `contracts` | Translates raw RPC hex logs into typed events. |
| **EventNormalizer** | `contracts` | Converts protocol events into stable, database-agnostic relational record shapes. |
| **RecordRepository** | `database` | Writes records to Postgres using batch inserts and transaction locks. |
| **IndexingPipeline** | `indexer` | Coordinates execution order; does not contain logic implementation details. |

---

## 3. Preserving Replayability

*   **No Internal State:** The pipeline stores no configuration offsets, checkpoints, or processed lists in local memory.
*   **Idempotency Propagation:** By separating translation from writes, duplicate blocks retrieved via `BlockchainReader` are processed by `EventNormalizer` and passed to `RecordRepository`, where they are safely skipped via `ON CONFLICT` clauses.
*   **Safe Failures:** If decoding, normalization, or network RPC fails halfway through, the pipeline halts. No partial data is written because the repository is never called, and any database operations roll back cleanly.

---

## 4. Extensibility Without Contract Modification

The pipeline signature is designed as a stateless loop step. We can add complex production features around this interface without modifying its code:

1.  **Checkpointing:** The outer loop manager (daemon worker) checks the `IndexingResult.toBlock` on success and writes it to a `checkpoints` database table. The pipeline contract does not need to know where checkpoints are stored.
2.  **Reorg Handling:** A parent controller detects chain splits by matching parent block hashes. If a reorg occurs, it deletes records beyond the fork block and restarts the pipeline from the fork height.
3.  **Metrics & Alerting:** We can wrap the pipeline in a decorator pattern:
    ```typescript
    class InstrumentedPipeline extends IndexingPipeline {
      public override async execute(config) {
         const result = await super.execute(config);
         metrics.gauge("sync_caught_up", result.caughtUp ? 1 : 0);
         metrics.increment("logs_fetched", result.logsFetched);
         return result;
      }
    }
    ```
4.  **Error Retries:** An outer retry handler catches exceptions and applies exponential backoff before calling `pipeline.execute()` again.
5.  **Analytics Propagation:** A downstream queue listener consumes successful `IndexingResult` summaries to invalidate cache keys or trigger rollup calculations.
