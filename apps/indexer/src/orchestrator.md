# Synchronization Orchestrator Design

The `SyncOrchestrator` acts as the coordinator responsible for executing exactly one step of the block synchronization loop. It sits at the top of the synchronization pipeline, binding stateless calculations and Web3 RPC operations together.

---

## 1. Why Orchestration is Separated from Business Logic

To prevent code complexity and ensure reliability, the Orchestrator does **one thing only**: it coordinates the data flow of a single sync iteration.

```
       +-----------------------+
       |   SyncOrchestrator    |  <-- Coordinates the workflow steps
       +-----------------------+
         /                   \
        /                     \
       v                       v
+---------------+       +------------------+
|  Sync Planner |       | BlockchainReader |  <-- Perform individual operations
|  (Stateless)  |       |    (EVM/RPC)     |
+---------------+       +------------------+
```

### Architectural Benefits:
1.  **Single Responsibility Principle (SRP):** The orchestrator doesn't know *how* ranges are planned (that is the Sync Planner's job) and doesn't know *how* RPC requests are carried out (that is the `BlockchainReader`'s job). It only manages the sequence.
2.  **Statelessness:** The orchestrator maintains no internal memory or database checkpoints. It receives input states, runs its coordination steps, and returns the result, remaining completely side-effect free outside of calling the RPC wrapper.
3.  **Deliberate Lack of Business Logic:** By keeping the orchestrator clean of event parsing, decoders, normalizers, or database queries, it is resilient to protocol changes. Upgrading contract event definitions or modifying target database schemas has zero impact on the orchestrator.

---

## 2. Testability & Replayability

Because the orchestrator has zero side-effects and acts purely as a coordinator:
*   **Simple Mocking:** We test the orchestrator by passing mock readers and inputs. If we want to simulate connection failures or empty chains, we don't have to alter the orchestrator; we simply configure the mock reader.
*   **Pipeline Determinism:** Testing the orchestrator checks that parameters (blocks, topics, addresses) are passed to the reader in the correct format. This verifies that our sync loop boundaries are safe.
