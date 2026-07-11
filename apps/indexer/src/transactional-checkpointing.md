# Transactional Checkpointing Semantics

This document details the architectural design and crash-safety guarantees provided by the **sera-data** transactional checkpointing implementation.

---

## 1. Why Checkpointing is Transactional

A checkpoint represents the pipeline's progress through the block log history. If checkpoint updates are executed separately from event persistence writes, two failure scenarios emerge:

1.  **Checkpoint Advanced, Writes Failed (Under-Indexing):**
    If the checkpoint is updated in the database but the transaction writing the block's event records fails (e.g. disk full, network error, conflict rollback), the indexer assumes the block was successfully processed. On restart, it skips the block, leaving a permanent gap in protocol records.
2.  **Writes Succeeded, Checkpoint Failed (Over-Indexing / Duplication):**
    If the event records are successfully saved but the indexer crashes before saving the advanced checkpoint, the indexer will re-process the same block range on restart. If insertions are not fully idempotent, this leads to duplicate protocol record rows.

By placing both `saveRecords()` and `saveCheckpoint()` in the **same database transaction block**, PostgreSQL ensures that either both operations commit successfully or both rollback completely.

---

## 2. Crash Recovery and Replay Guarantees

*   **Atomic Rollbacks:** If the indexing service crashes midway through parsing a block batch, the database automatically drops the active uncommitted transaction.
*   **Idempotence:** If a crash happens, the indexer resumes precisely from the last successfully committed checkpoint block (`latest_indexed_block + 1`).
*   **Safety Over Head:** There is no need for manual transaction retry mechanisms inside the pipeline; standard transaction boundaries guarantee database consistency on resume.

---

## 3. Exactly-Once Semantics

By pairing transactional checkpointing with idempotent inserts (`ON CONFLICT DO NOTHING`), `sera-data` achieves **exactly-once processing semantics** at the database boundary:

1.  If a block range has never been indexed: it is processed and committed once.
2.  If a block range is partially processed and crashes: the transaction rolls back, and it is processed once on recovery.
3.  If a block range is successfully indexed but the indexer runs a replay script: the database discards duplicates safely via composite primary keys.

---

## 4. Separation of Checkpoints and Protocol Data

Checkpoints are **operational metadata**, whereas deposits, withdrawals, and trades are **protocol data**. We isolate checkpoints into a dedicated `checkpoints` table because:

*   **Future Chain Portability:** A single indexer deployment can index multiple chains concurrently. A separate metadata table allows independent state tracking per named indexer and chain.
*   **Decoder Upgrade Independence:** If contract event ABIs change, we can drop and rebuild the Layer 1 protocol tables without losing track of the indexer's sync state or chain progress logs.
