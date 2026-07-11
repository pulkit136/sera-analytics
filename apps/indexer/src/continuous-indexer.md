# ContinuousIndexer — Daemon Design Reference

`ContinuousIndexer` wraps an `IndexingPipeline` in a long-running control loop. It handles polling, exponential backoff for transient failures, graceful OS signal shutdown, and structured state logging.

---

## Lifecycle

```
start() called
    │
    ▼
 Starting ──► Syncing ──────────────────────────────────────────────────────┐
                │                                                            │
                │ caughtUp=true                                              │
                ▼                                                            │
              Idle ──(pollingIntervalMs elapsed)──► Syncing ◄───────────────┘
                │                                    │
                │                          caughtUp=false (tight loop)
                │
          Any error at any point
                │
                ▼
             Error ──► BackingOff ──(jittered delay)──► Recovering ──► Syncing
               ▲              │                              │
               └──────────────┘ (still failing)     (success: resets)
               (loop forever until success or stop())

stop() called at any point
    │
    ▼
 Stopping ──► Stopped
```

---

## State Reference

| State | Meaning |
|---|---|
| `Starting` | Initial. `start()` has not yet been called. |
| `Syncing` | A batch is executing (healthy). |
| `Idle` | Caught up; sleeping `pollingIntervalMs` before next check. |
| `BackingOff` | Sleeping a jittered exponential delay after a failure. |
| `Recovering` | About to retry after a backoff sleep. |
| `Error` | **Health indicator** — at least one consecutive failure. The daemon continues retrying. |
| `Stopping` | `stop()` was called; current batch finishing. |
| `Stopped` | Loop exited cleanly. Terminal. |

> **`Error` is not terminal.** The daemon never self-terminates. It remains in the `Error → BackingOff → Recovering` cycle until either a successful batch resets `consecutiveFailures` (state → `Syncing`) or `stop()` is called.

---

## Polling Strategy

When the indexer is **behind** the chain head (`caughtUp = false`), batches execute immediately in a tight loop with no sleep. This maximises catch-up throughput.

When the indexer is **caught up** (`caughtUp = true`), the daemon enters `Idle` and sleeps for `pollingIntervalMs` before calling `pipeline.execute()` again. The sleep is interrupted immediately if `stop()` is called.

Recommended `pollingIntervalMs`: **12 000 ms** (roughly one Ethereum mainnet block time). Shorter intervals add unnecessary RPC load; longer intervals delay detection of new events.

---

## Exponential Backoff with Jitter

On any pipeline error the delay is computed as:

```
base  = min(initialBackoffMs × 2^(n−1), maxBackoffMs)
delay = base × (1 + jitterFactor × rand(−1, 1))
```

Where `n` is the current consecutive failure count (1-indexed).

| Failure | Formula | Example (initial=1 s, max=60 s) |
|---|---|---|
| 1st | `base = initial × 2^0 = initial` | ~1 000 ms |
| 2nd | `base = initial × 2^1` | ~2 000 ms |
| 3rd | `base = initial × 2^2` | ~4 000 ms |
| 6th | `base = initial × 2^5` | ~32 000 ms |
| 7th+ | `base = maxBackoffMs` | ~60 000 ms (capped) |

**Jitter** (`jitterFactor`, default 0.15 = ±15%) randomises the delay symmetrically so multiple indexer instances that share the same RPC node do not thunderherd on recovery. The effective spread is approximately 10–20% of `base`.

On first success after failures, `consecutiveFailures` resets to 0 and the backoff schedule restarts from scratch.

---

## Shutdown Guarantees

1. **Signal registration**: `SIGINT` and `SIGTERM` both call `stop()` internally.
2. **Graceful**: The current `pipeline.execute()` call, if any, runs to completion before the loop exits.
3. **Sleep interruption**: Any in-progress `Idle` or `BackingOff` sleep is cancelled immediately via `AbortController`, so shutdown does not wait for a full polling or backoff interval.
4. **Force-resolve timeout**: If the current batch takes longer than `shutdownTimeoutMs` (default 10 000 ms), `stop()` resolves anyway and the state transitions to `Stopped`. This prevents callers from hanging during a stuck RPC call.
5. **Signal deregistration**: Once `Stopped`, `SIGINT`/`SIGTERM` handlers are removed so repeated signals have no effect.
6. **Idempotency**: Calling `stop()` more than once returns the same resolved `Promise` without side-effects.

---

## Crash Recovery

`ContinuousIndexer` operates above the checkpoint layer. If the process crashes mid-batch:

- The Kysely transaction wrapping `saveRecords + saveCheckpoint` is rolled back by PostgreSQL.
- On restart, `getCheckpoint()` returns the last committed block.
- The pipeline replays from that block, producing identical records (upsert semantics).
- Any in-flight reorg detection also restarts cleanly from the persisted `block_metadata`.

The daemon itself is stateless across restarts. All durable state lives in the database.

---

## Configuration Reference

```typescript
interface ContinuousIndexerConfig {
  pipeline:           IndexingPipeline;        // fully constructed pipeline
  pipelineConfig:     IndexingPipelineConfig;  // forwarded to every execute()
  pollingIntervalMs:  number;                  // sleep when caught up (ms)
  initialBackoffMs:   number;                  // first backoff delay (ms)
  maxBackoffMs:       number;                  // backoff ceiling (ms)
  jitterFactor?:      number;                  // default 0.15 (±15%)
  shutdownTimeoutMs?: number;                  // default 10 000 ms
  logger?:            Logger;                  // default: shared ConsoleLogger
}
```

### Recommended production values

```typescript
{
  pollingIntervalMs:  12_000,   // ~1 ETH block
  initialBackoffMs:   1_000,    // 1 s first retry
  maxBackoffMs:       60_000,   // 1 min ceiling
  jitterFactor:       0.15,     // ±15%
  shutdownTimeoutMs:  10_000,   // 10 s force-stop
}
```

---

## Usage Example

```typescript
import { IndexingPipeline } from "./pipeline.js";
import { ContinuousIndexer } from "./daemon.js";

const pipeline = new IndexingPipeline(reader, decoder, normalizer, repository, checkpointStore, db);

const daemon = new ContinuousIndexer({
  pipeline,
  pipelineConfig: {
    startBlock:        20_000_000,
    batchSize:         2_000,
    contractAddresses: [CONTRACT_ADDRESSES.VAULT],
    indexerName:       "vault-indexer",
    chainId:           1,
  },
  pollingIntervalMs: 12_000,
  initialBackoffMs:  1_000,
  maxBackoffMs:      60_000,
  jitterFactor:      0.15,
  shutdownTimeoutMs: 10_000,
});

daemon.start();  // begins loop, registers SIGINT/SIGTERM

// Query health at any time:
console.log(daemon.state);            // "Syncing" | "Idle" | "Error" | …
console.log(daemon.consecutiveFailures);

// Clean shutdown (e.g. from a health check or orchestrator):
await daemon.stop();
```
