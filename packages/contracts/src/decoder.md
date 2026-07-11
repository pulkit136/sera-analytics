# Event Decoder Design

The `EventDecoder` is responsible for transforming raw blockchain logs (`BlockchainLog`) into strongly-typed protocol event representations (`SeraEvent`). It serves as the primary parser at the boundary of the on-chain ingest pipeline.

---

## 1. Separation of Concerns: Decoding vs. Normalization

The ingest pipeline separates event processing into two distinct, sequential phases:

```
+------------------+       +-------------------+       +-----------------------+
|  BlockchainLog   |  -->  |   EventDecoder    |  -->  |   EventNormalizer     |
|   (Raw EVM Log)  |       |  (SeraEvent/ABI)  |       |  (Business Entities)  |
+------------------+       +-------------------+       +-----------------------+
```

### Why they are isolated:
1.  **ABI-First Parsing:** The decoding phase represents pure ABI extraction. It only translates Solidity structures (`uint256`, `bytes32`, `address`) into TypeScript native structures (`bigint`, `string`). It does not understand business concepts (like "TVL", "User Balances", or "Trading Volumes").
2.  **Stateless translation:** The decoder performs a 1-to-1 conversion of single log inputs. Normalization, by contrast, frequently combines multiple events, accesses database records, or derives metrics across historical contexts.
3.  **Low Maintenance Surface:** If the protocol updates or changes downstream storage models (e.g. database column names or aggregation tables), the decoder remains completely untouched.

---

## 2. Why UnknownEvent is Preferable to Throwing

When processing public blockchains, the indexer will occasionally scan logs that are not part of the core analytics scope (e.g. standard ERC20 transfers, admin upgrades, or third-party contract interactions).
*   **Pipeline Resilience:** Throwing an exception on unparsed logs would crash the sync worker or halt indexing cycles.
*   **Graceful Ignorance:** Returning an explicit `UnknownEvent` tells the orchestrator that the log was read successfully but contains no data relevant to the Sera Protocol. The loop skips it gracefully and moves to the next log.
*   **Replay Debugging:** Storing or logging `UnknownEvent` details during development makes it easy to audit why certain logs were skipped, or if the indexer is missing any configured contract addresses.

---

## 3. Extensibility: Adding New Protocol Events Safely

The decoder uses a type-safe Discriminated Union (`SeraEvent`) keyed by the `type` property.

To add a new event safely:
1.  **Update the ABI:** Add the new Solidity event definition to `abis.ts`.
2.  **Extend the Union:** Define the new event interface (inheriting from `BaseEvent`) and append it to the `SeraEvent` union in `decoder.ts`.
3.  **Compiler Validation:** Because all downstream normalizers pattern-match on `event.type`, TypeScript will automatically prompt or guide developers to handle the new case in switch/case paths, preventing silent runtime skipping.
