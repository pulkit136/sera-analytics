# @sera/metadata

A deterministic, replayable Layer 2 enrichment engine for ERC-20 token metadata.

## Purpose

The `@sera/metadata` package defines the core architectural contracts, domain types, and error hierarchies for the enrichment layer of the `sera-data` platform. It is responsible for taking raw Layer 1 token identifiers (chain ID, contract address) and enriching them with metadata (symbol, name, decimals, logos) in a deterministic, replayable manner.

---

## Token Discovery Subsystem

The **Token Discovery Subsystem** is a protocol-agnostic, deterministic Layer 2 stage responsible for identifying assets requiring metadata enrichment. It observes Layer 1 normalized records and outputs unique discovery batches containing token addresses that were seen for the first time.

### Dependency Boundaries & Separate Concern
Discovery is structurally decoupled from queueing, fetching, providers, retries, and database persistence.
* **No Database Dependencies**: It operates entirely in-memory on arrays of normalized Layer 1 records.
* **No RPC or Viem Dependencies**: It never queries blockchains or triggers network requests.
* **Strict Abstraction**: The core engine knows nothing about providers, scheduling, or actual metadata schemas.

### Architecture

```
   NormalizedRecord[] (Layer 1 records: Deposit, Withdrawal, Swap, etc.)
                         ↓
             [ DiscoveryEngine ]
            ┌────────────┴────────────┐
            ▼                         ▼
   [ TokenDiscoveryRegistry ] ──► [ TokenDiscoveryRules ]
            │                         │ (Deposit, Swap, Withdrawal)
            ▼                         ▼
   [ DiscoveryCandidate[] ] ──► [ Deduplication Stage ]
                         ↓
               [ DiscoveryBatch ] (Unique Discovered Tokens)
```

1. **`DiscoveryCandidate`**: Raw discovery evidence emitted by rules. Represents a single token observation. Can contain duplicates.
2. **`DiscoveredToken`**: Normalized (lowercased), unique output representing a validated discovery candidate.
3. **`DiscoveryBatch`**: Value object encapsulating all unique discovered tokens in a specific block range.
4. **`TokenDiscoveryRule`**: Protocol-specific rule targeting a specific `recordType`.
5. **`TokenDiscoveryRegistry`**: Handles dynamic rule registration, matching the **Open/Closed Principle** (new rules can be added at runtime without code alterations).
6. **`DiscoveryEngine`**: Executes registered rules, aggregates candidates, and runs the deterministic deduplication pipeline.

---

## Deterministic Deduplication Semantics

To guarantee identical output during genesis replays:
1. **Earliest Observation Preference**: If a token is discovered multiple times in a single batch, the candidate with the **lowest `blockNumber`** is kept.
2. **Deterministic Tie-Breaking**: If block numbers are identical:
   - Candidates are sorted alphabetically by their L1 transaction hash (`source.txHash`).
   - If transaction hashes are also identical, they are sorted ascending by their `source.logIndex`.
   - The first candidate in this sorted collection is selected.
3. **Chronological Output**: The final tokens inside a `DiscoveryBatch` are sorted in chronological order (`blockNumber` ascending, then alphabetically by `txHash`, then ascending by `logIndex`).

---

## Discovery Extension Guide

To support new protocol types (e.g. NFT collections, ENS domains, custom AMM pools) without architectural redesign:
1. Implement a new class implementing the `TokenDiscoveryRule` interface:
   ```typescript
   export class CustomMintDiscoveryRule implements TokenDiscoveryRule {
     public readonly recordType = "custom_mint";

     public discover(record: unknown): DiscoveryCandidate[] {
       const rec = record as Record<string, unknown>;
       // Extract token address, block number, tx hash, and log index...
       return [{ chainId: 1, tokenAddress, blockNumber, reason: "Other", source }];
     }
   }
   ```
2. Register the rule with the `TokenDiscoveryRegistry`:
   ```typescript
   registry.register(new CustomMintDiscoveryRule());
   ```
3. Pass Layer 1 records to the `DiscoveryEngine`. The custom records will automatically map and discover the new tokens.

---

## Persistence Model & Overwrite Semantics

A single metadata record exists per `(chain_id, token_address)`. This is a valid assumption for standard ERC-20 tokens.

* **Full Snapshot Replacement**: When `upsert` or `upsertMany` is called, any existing record for `(chain_id, token_address)` is completely replaced with the incoming snapshot. No partial updates or field-level merges are performed.
* **No Repository-level priority logic**: The repository remains a dumb, stateless persistence module and does not make conflict resolution decisions.

---

## Dependency Boundaries

Strict architectural isolation is enforced to keep this package clean and portable:
* **No SQL / DB Clients**: It must not depend on `Kysely`, write raw SQL, or expose db pools/clients.
* **No RPC Dependencies**: Direct Viem imports or JSON-RPC clients are not allowed.
* **Uncoupling from Analytics / Apps**: The package must remain independent of analytics systems and application runners.
* **Shared Abstractions**: Depends exclusively on core, shared domain abstractions (`@sera/shared`).

---

## Future Milestones

1. **Milestone 4**: Build an On-Chain Metadata Provider using multicall.
2. **Milestone 5**: Build a Registry REST Provider with rate-limiting.
3. **Milestone 6**: Implement the Postgres-backed `MetadataQueue` and `MetadataPipeline`.
