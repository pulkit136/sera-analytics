# Block Synchronization Algorithm

The block synchronization algorithm deterministically calculates the block range that the indexer should fetch next. This is a pure mathematical calculation designed to run statelessly and deterministically.

---

## Math & Range Rules

Let:
*   $S$ be the configured `startBlock` (non-negative integer).
*   $L$ be the current `latestBlock` confirmed on the blockchain (non-negative integer).
*   $I$ be the `currentIndexedBlock` recorded in the database (nullable integer, where $I \ge 0$).
*   $B$ be the configured `batchSize` limits ($B \in \mathbb{Z}^+$).

### 1. Starting Point Resolution

The starting block $F$ (from block) of the next execution range is determined by:
$$F = \begin{cases} S & \text{if } I \text{ is } null \\ I + 1 & \text{otherwise} \end{cases}$$

### 2. Handing Chain State Bounds

If the blockchain is empty or behind the resolved starting block height (i.e. $L < F$):
*   We are **caught up** ($isCaughtUp = true$).
*   Remaining blocks to index is $0$ ($remainingBlocks = 0$).
*   Next execution range returned is empty: $[F, F-1]$.

### 3. In-Bounds Execution Range

If $L \ge F$:
*   The raw potential ending block candidate is $C = F + B - 1$.
*   The actual ending block of the next batch is bounded by the head of the chain:
    $$T = \min(C, L)$$
*   The count of remaining blocks left to process after this batch is:
    $$R = L - T$$
*   We are caught up if the batch ended at or past the chain head:
    $$isCaughtUp = T \ge L$$

---

## Output Struct

The function returns the following details:
```typescript
{
  nextFromBlock: number, // F
  nextToBlock: number,   // T
  isCaughtUp: boolean,   // T >= L
  remainingBlocks: number // L - T
}
```
An empty block range is represented when `nextToBlock < nextFromBlock` (specifically, `nextToBlock = nextFromBlock - 1`), indicating that no execution of events fetch should occur.
