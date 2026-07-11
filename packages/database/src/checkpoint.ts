import { CheckpointError } from "./errors.js";
import type { DatabaseContext } from "./schema.js";

/**
 * CheckpointStore abstraction responsible for tracking indexing progress.
 */
export interface CheckpointStore {
  /**
   * Reads the latest successfully indexed block for the given indexer and chain.
   * Returns null if no checkpoint has been saved yet.
   *
   * @param db Shared DatabaseContext (connection pool or transaction instance).
   * @param indexerName Unique name identifying the indexer.
   * @param chainId ID of the EVM chain.
   * @throws {CheckpointError} If the database query fails.
   */
  getCheckpoint(db: DatabaseContext, indexerName: string, chainId: number): Promise<number | null>;

  /**
   * Persists the latest successfully committed block for the given indexer and chain.
   * Performs an upsert atomically.
   *
   * @param db Shared DatabaseContext (connection pool or transaction instance).
   * @param indexerName Unique name identifying the indexer.
   * @param chainId ID of the EVM chain.
   * @param blockNumber Latest block height processed.
   * @throws {CheckpointError} If the database query fails.
   */
  saveCheckpoint(
    db: DatabaseContext,
    indexerName: string,
    chainId: number,
    blockNumber: number,
  ): Promise<void>;
}

/**
 * PostgreSQL-based implementation of the CheckpointStore using Kysely.
 */
export class PostgreSqlCheckpointStore implements CheckpointStore {
  /**
   * Reads the latest successfully indexed block number.
   */
  public async getCheckpoint(
    db: DatabaseContext,
    indexerName: string,
    chainId: number,
  ): Promise<number | null> {
    try {
      const row = await db
        .selectFrom("checkpoints")
        .select("latest_indexed_block")
        .where("indexer_name", "=", indexerName)
        .where("chain_id", "=", chainId)
        .executeTakeFirst();

      return row ? Number(row.latest_indexed_block) : null;
    } catch (error) {
      if (error instanceof CheckpointError) throw error;
      throw new CheckpointError(
        `Failed to retrieve checkpoint for indexer "${indexerName}" on chain ${chainId}`,
        error,
      );
    }
  }

  /**
   * Persists the latest successfully committed block checkpoint atomically.
   */
  public async saveCheckpoint(
    db: DatabaseContext,
    indexerName: string,
    chainId: number,
    blockNumber: number,
  ): Promise<void> {
    try {
      await db
        .insertInto("checkpoints")
        .values({
          indexer_name: indexerName,
          chain_id: chainId,
          latest_indexed_block: blockNumber,
          updated_at: new Date(),
        })
        .onConflict((oc) =>
          oc.column("indexer_name").doUpdateSet({
            chain_id: chainId,
            latest_indexed_block: blockNumber,
            updated_at: new Date(),
          }),
        )
        .execute();
    } catch (error) {
      if (error instanceof CheckpointError) throw error;
      throw new CheckpointError(
        `Failed to save checkpoint for indexer "${indexerName}" at block ${blockNumber} on chain ${chainId}`,
        error,
      );
    }
  }
}
