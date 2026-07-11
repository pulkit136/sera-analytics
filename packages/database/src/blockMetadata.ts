import type { SelectQueryBuilder } from "kysely";
import { ReorgError } from "./errors.js";
import type { DatabaseContext } from "./schema.js";

/**
 * Represents the stored header information for a single block.
 */
export interface BlockMetadata {
  chainId: number;
  blockNumber: number;
  blockHash: string;
  parentBlockHash: string;
  isCanonical: boolean;
}

/**
 * Represents a new block header to be stored in the database.
 */
export interface BlockMetadataInput {
  chainId: number;
  blockNumber: number;
  blockHash: string;
  parentBlockHash: string;
}

/**
 * Data access interface for block header metadata and canonical chain tracking.
 */
export interface BlockMetadataStore {
  /**
   * Inserts a new block header record.
   * If the same (chain_id, block_number, block_hash) already exists, this is a no-op.
   *
   * @param db Shared DatabaseContext.
   * @param block The block header to persist.
   */
  saveBlock(db: DatabaseContext, block: BlockMetadataInput): Promise<void>;

  /**
   * Returns the stored metadata for the most recently indexed canonical block
   * on the given chain. Returns null if no block has been indexed yet.
   *
   * @param db Shared DatabaseContext.
   * @param chainId The EVM chain ID.
   */
  getLatestCanonicalBlock(db: DatabaseContext, chainId: number): Promise<BlockMetadata | null>;

  /**
   * Returns the stored metadata for a specific block by (chain_id, block_number).
   * Returns null if the block has not been indexed.
   *
   * @param db Shared DatabaseContext.
   * @param chainId The EVM chain ID.
   * @param blockNumber The block height to look up.
   */
  getBlockByNumber(
    db: DatabaseContext,
    chainId: number,
    blockNumber: number,
  ): Promise<BlockMetadata | null>;

  /**
   * Marks all block_metadata rows on `chainId` at block heights >= `fromBlockNumber`
   * as non-canonical. This is the O(1) rollback operation during reorg recovery.
   *
   * @param db Shared DatabaseContext (should be inside a transaction).
   * @param chainId The EVM chain ID.
   * @param fromBlockNumber The first orphaned block height (inclusive).
   */
  markNonCanonical(db: DatabaseContext, chainId: number, fromBlockNumber: number): Promise<void>;
}

/**
 * PostgreSQL-backed implementation of BlockMetadataStore using Kysely.
 */
export class PostgreSqlBlockMetadataStore implements BlockMetadataStore {
  /**
   * Inserts a block header as canonical. Ignores conflicts (idempotent).
   */
  public async saveBlock(db: DatabaseContext, block: BlockMetadataInput): Promise<void> {
    try {
      await db
        .insertInto("block_metadata")
        .values({
          chain_id: block.chainId,
          block_number: block.blockNumber,
          block_hash: block.blockHash,
          parent_block_hash: block.parentBlockHash,
        })
        .onConflict((oc) => oc.columns(["chain_id", "block_number", "block_hash"]).doNothing())
        .execute();
    } catch (error) {
      throw new ReorgError(
        `Failed to save block ${block.blockNumber} (${block.blockHash}) on chain ${block.chainId}`,
        error,
      );
    }
  }

  /**
   * Returns the latest canonical block for the given chain.
   */
  public async getLatestCanonicalBlock(
    db: DatabaseContext,
    chainId: number,
  ): Promise<BlockMetadata | null> {
    try {
      const row = await db
        .selectFrom("block_metadata")
        .selectAll()
        .where("chain_id", "=", chainId)
        .where("is_canonical", "=", true)
        .orderBy("block_number", "desc")
        .limit(1)
        .executeTakeFirst();

      return row
        ? {
            chainId: row.chain_id,
            blockNumber: Number(row.block_number),
            blockHash: row.block_hash,
            parentBlockHash: row.parent_block_hash,
            isCanonical: row.is_canonical,
          }
        : null;
    } catch (error) {
      throw new ReorgError(`Failed to retrieve latest canonical block on chain ${chainId}`, error);
    }
  }

  /**
   * Returns the canonical block metadata for a specific block number.
   */
  public async getBlockByNumber(
    db: DatabaseContext,
    chainId: number,
    blockNumber: number,
  ): Promise<BlockMetadata | null> {
    try {
      const row = await db
        .selectFrom("block_metadata")
        .selectAll()
        .where("chain_id", "=", chainId)
        .where("block_number", "=", blockNumber)
        .where("is_canonical", "=", true)
        .executeTakeFirst();

      return row
        ? {
            chainId: row.chain_id,
            blockNumber: Number(row.block_number),
            blockHash: row.block_hash,
            parentBlockHash: row.parent_block_hash,
            isCanonical: row.is_canonical,
          }
        : null;
    } catch (error) {
      throw new ReorgError(`Failed to retrieve block ${blockNumber} on chain ${chainId}`, error);
    }
  }

  /**
   * Marks blocks at or above `fromBlockNumber` as non-canonical.
   * This is the rollback half of reorg recovery — O(1) regardless of
   * the number of protocol records involved.
   */
  public async markNonCanonical(
    db: DatabaseContext,
    chainId: number,
    fromBlockNumber: number,
  ): Promise<void> {
    try {
      await db
        .updateTable("block_metadata")
        .set({ is_canonical: false })
        .where("chain_id", "=", chainId)
        .where("block_number", ">=", fromBlockNumber)
        .where("is_canonical", "=", true)
        .execute();
    } catch (error) {
      throw new ReorgError(
        `Failed to mark blocks non-canonical from ${fromBlockNumber} on chain ${chainId}`,
        error,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Canonical query helper
// ---------------------------------------------------------------------------

/**
 * Applies an INNER JOIN against block_metadata to restrict any result set
 * to canonical records only.
 *
 * Usage:
 *   const query = withCanonical(
 *     db.selectFrom("deposits").selectAll("deposits"),
 *     "deposits"
 *   );
 *
 * Every repository read query should pass through this helper by default.
 * To access historical non-canonical data, omit the join and query
 * raw tables directly.
 */
export function withCanonical<O>(
  // biome-ignore lint/suspicious/noExplicitAny: Kysely generic query builder requires any for cross-table join utility
  query: SelectQueryBuilder<any, any, O>,
  targetTable: string,
  // biome-ignore lint/suspicious/noExplicitAny: Kysely generic query builder requires any for cross-table join utility
): SelectQueryBuilder<any, any, O> {
  return query.innerJoin("block_metadata", (join) =>
    join
      // biome-ignore lint/suspicious/noExplicitAny: string interpolation for table ref is valid Kysely pattern
      .onRef("block_metadata.chain_id", "=", `${targetTable}.chain_id` as any)
      // biome-ignore lint/suspicious/noExplicitAny: string interpolation for table ref is valid Kysely pattern
      .onRef("block_metadata.block_hash", "=", `${targetTable}.block_hash` as any)
      .on("block_metadata.is_canonical", "=", true),
  );
}
