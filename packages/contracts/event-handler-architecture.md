# Event Handler Architecture

The **EventHandler Registry** replaces monolithic normalization logic with a modular, handler-driven dispatch pattern. It encapsulates transaction mapping logic cleanly per smart contract event.

---

## 1. Why Handler-Based Normalization Scales Better

1.  **Code Partitioning:** A monolithic `switch` block in a normalizer class quickly grows to hundreds of lines as more events are added. Splitting logic into individual files (e.g. `deposited.handler.ts`) keeps files under 50 lines.
2.  **Merge Conflict Reduction:** Multiple developers can add or update different event mappings in parallel without touching a single large orchestrator class, avoiding Git conflicts in the shared source code.
3.  **Fast and Targeted Audits:** When auditing a transaction settle event bug, engineers only need to read the specific `orderMatched.handler.ts` code, with zero noise from unrelated deposits or withdrawals.

---

## 2. How New Protocol Events are Added

Adding a new protocol event is a simple two-step process:

1.  **Create the Handler:** Create a new handler file under `packages/contracts/src/handlers/` implementing the `EventHandler` interface.
2.  **Register the Handler:** Add the handler to the static `handlers` map in `packages/contracts/src/handlers/registry.ts`:
    ```typescript
    [NewEventHandler.eventName, NewEventHandler]
    ```

No changes are required in `DefaultEventNormalizer` or the indexing orchestrator loop. The registry dynamically routes the new event name.

---

## 3. Isolating Protocol Logic Per Event

Smart contract events represent decoupled state transitions. By isolating mapping logic, we prevent cross-event bugs:
*   A change in how limit order fees are calculated in `OrderMatched` cannot break or impact balance calculations for standard `Deposited` logs.
*   Types are strictly defined per event parameters using TypeScript generics, reducing typecasts or `any` usages.

---

## 4. Supporting Future Protocol Upgrades

When the Sera protocol is upgraded:

1.  **V2 Event Mappings:** If a contract releases a `DepositedV2` event with new arguments, we simply create a new `depositedV2.handler.ts` file. We do not modify the existing `Deposited` handler. This preserves 100% backward compatibility for historic block replays.
2.  **Dynamic Overriding:** The `register` API allows registering custom or mocking handlers at runtime, which is incredibly useful for testing upgrades or backfilling specific event ranges in staging.
