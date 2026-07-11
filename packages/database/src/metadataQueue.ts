import type { MetadataQueue, MetadataQueueItem, MetadataQueueItemStatus } from "@sera/metadata";
import { sql } from "kysely";
import { type DatabaseContext, PersistenceError } from "./index.js";

/**
 * PostgreSQL-backed implementation of MetadataQueue using Kysely.
 */
export class KyselyMetadataQueue implements MetadataQueue {
  /**
   * Enqueues new jobs into the queue. Idempotent: conflicts are ignored.
   */
  public async enqueue(db: DatabaseContext, items: MetadataQueueItem[]): Promise<void> {
    if (items.length === 0) return;

    try {
      const rows = items.map((item) => ({
        chain_id: item.chainId,
        token_address: item.tokenAddress.toLowerCase(),
        enrichment_type: item.enrichmentType,
        status: item.status,
        attempt_count: item.attemptCount,
        run_at: new Date(item.runAt),
        last_error: item.lastError,
        block_number_observed: item.blockNumberObserved,
      }));

      await db
        .insertInto("metadata_queue")
        .values(rows)
        .onConflict((oc) => oc.columns(["chain_id", "token_address"]).doNothing())
        .execute();
    } catch (error) {
      throw new PersistenceError("Failed to enqueue items into metadata_queue", error as Error);
    }
  }

  /**
   * Pulls a bounded number of pending or eligible failed jobs from the queue.
   * Sorted in chronological block order to ensure strict replay guarantees.
   */
  public async nextPending(db: DatabaseContext, limit: number): Promise<MetadataQueueItem[]> {
    try {
      const rows = await db
        .selectFrom("metadata_queue")
        .selectAll()
        .where("status", "in", ["Pending", "Failed"])
        .where("run_at", "<=", new Date())
        .orderBy("block_number_observed", "asc")
        .orderBy("token_address", "asc") // deterministic tie-breaker
        .limit(limit)
        .execute();

      return rows.map((row) => ({
        chainId: row.chain_id,
        tokenAddress: row.token_address,
        enrichmentType: row.enrichment_type,
        status: row.status as MetadataQueueItemStatus,
        attemptCount: row.attempt_count,
        runAt: row.run_at.toISOString(),
        lastError: row.last_error,
        blockNumberObserved: Number(row.block_number_observed),
      }));
    } catch (error) {
      throw new PersistenceError(
        "Failed to query next pending items from metadata_queue",
        error as Error,
      );
    }
  }

  /**
   * Marks a job completed by removing it from the active queue.
   */
  public async markCompleted(
    db: DatabaseContext,
    chainId: number,
    tokenAddress: string,
  ): Promise<void> {
    try {
      await db
        .deleteFrom("metadata_queue")
        .where("chain_id", "=", chainId)
        .where("token_address", "=", tokenAddress.toLowerCase())
        .execute();
    } catch (error) {
      throw new PersistenceError(
        `Failed to mark metadata_queue item completed for ${tokenAddress} on chain ${chainId}`,
        error as Error,
      );
    }
  }

  /**
   * Marks a job failed, increments attempt count, and transitions to 'Dead' if threshold is reached.
   */
  public async markFailed(
    db: DatabaseContext,
    chainId: number,
    tokenAddress: string,
    error: string,
    nextRunAt: Date,
  ): Promise<void> {
    try {
      await db
        .updateTable("metadata_queue")
        .set({
          attempt_count: sql`attempt_count + 1`,
          // Transition to Dead state after 5 failed attempts
          status: sql`CASE WHEN attempt_count + 1 >= 5 THEN 'Dead' ELSE 'Failed' END`,
          last_error: error,
          run_at: nextRunAt,
        })
        .where("chain_id", "=", chainId)
        .where("token_address", "=", tokenAddress.toLowerCase())
        .execute();
    } catch (err) {
      throw new PersistenceError(
        `Failed to mark metadata_queue item failed for ${tokenAddress} on chain ${chainId}`,
        err as Error,
      );
    }
  }

  /**
   * Checks if a job already exists in the queue.
   */
  public async exists(
    db: DatabaseContext,
    chainId: number,
    tokenAddress: string,
  ): Promise<boolean> {
    try {
      const row = await db
        .selectFrom("metadata_queue")
        .select("token_address")
        .where("chain_id", "=", chainId)
        .where("token_address", "=", tokenAddress.toLowerCase())
        .executeTakeFirst();

      return !!row;
    } catch (error) {
      throw new PersistenceError(
        `Failed to check existence of metadata_queue item for ${tokenAddress} on chain ${chainId}`,
        error as Error,
      );
    }
  }
}
