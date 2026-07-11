# Blockchain Reader Abstraction

The `BlockchainReader` serves as the abstract boundary separating the core indexing logic from the raw Web3/EVM client execution layers (Viem).

---

## 1. Why Viem is Hidden

In blockchain systems, libraries and client APIs frequently undergo major changes, upgrades, or refactors. If indexer logic directly consumes library-specific types (such as `Log` or `PublicClient` from Viem), then:
1.  **Tight Coupling:** Upgrading the Web3 library requires editing file mappings across multiple packages (e.g. indexers, decoders, normalizers).
2.  **Type Pollution:** EVM-specific details (like checksum types, bigint formats, and private object states) leak into business logic layers.

By hiding Viem behind the `BlockchainReader` interface, the rest of the application interacts with clean, standardized, and plain types (`BlockchainLog` and `bigint`). If we decide to swap Viem out for Ethers.js, standard JSON-RPC HTTP calls, or a custom indexer in the future, we only have to write a new implementation of `BlockchainReader` (e.g., `EthersBlockchainReader`). All callers remain completely unmodified.

---

## 2. Testability & Determinism

Deterministic indexing requires that we can replay block cycles under controlled test environments.
*   **Decoupled RPC State:** By hiding direct RPC triggers, we can mock `BlockchainReader` entirely. Tests don't need real network setups or hardcoded mock RPC servers; they inject test log objects directly into the mock reader.
*   **Reproducible Failure Cases:** Testing rate limits, connection dropouts, block reorgs, and RPC timeouts becomes trivial because we can configure the mock reader to throw specific errors on specific block ranges.

---

## 3. Future-Proof Operations (Retries, Limits, Failovers)

By consuming `BlockchainReader` via dependency injection, we can enrich the reader's behavior using the **Decorator Pattern** without changing callers:

```
                  +--------------------------+
                  |     BlockchainReader     |
                  |       (Interface)        |
                  +--------------------------+
                               ^
                               |
            +------------------+------------------+
            |                                     |
+--------------------------+          +--------------------------+
|  ViemBlockchainReader    |          |  RetryingBlockchainReader |
|      (Concrete Imp)      |          |       (Decorator)        |
+--------------------------+          +--------------------------+
            |                                     |
      Directs to RPC                              | delegates to
                                                  v
                                      +--------------------------+
                                      |     BlockchainReader     |
                                      +--------------------------+
```

### Implementing Resilience Features:
1.  **Retries with Exponential Backoff:** We wrap any `BlockchainReader` in a `RetryingBlockchainReader` decorator that intercepts errors and retries calls up to a configured threshold.
2.  **Rate Limiting:** A `RateLimitedBlockchainReader` can pace `getLogs` invocations using a token bucket token limiter.
3.  **RPC Failover / Backup:** A `FailoverBlockchainReader` takes a prioritized list of concrete reader instances, forwarding calls to backups if the primary node throws an error.
4.  **Log Batching:** If a block range is too wide and throws gas limit errors, a `BatchingBlockchainReader` can split the request range dynamically into smaller chunks.

All these decorators implement the identical `BlockchainReader` interface, ensuring zero code changes in the indexer runtime.
