import type { BlockchainReader } from "@sera/contracts";
import {
  type BlockMetadataStore,
  type CheckpointStore,
  type DatabaseContext,
  ReorgError,
} from "@sera/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The result of a reorg detection check.
 */
export type ReorgCheckResult =
  | { reorgDetected: false }
  | { reorgDetected: true; rollbackToBlock: number };

/**
 * Configuration for the ReorgDetector.
 */
export interface ReorgDetectorConfig {
  /** EVM chain ID being indexed. */
  chainId: number;
  /**
   * Maximum number of blocks to walk back when searching for a common ancestor.
   * Protects against deep reorgs (or RPC inconsistencies).
   */
  maxRollbackDepth: number;
}

// ---------------------------------------------------------------------------
// ReorgDetector
// ---------------------------------------------------------------------------

/**
 * Detects chain reorganizations by comparing stored block hashes against
 * the current canonical hashes reported by the RPC node.
 *
 * Detection algorithm:
 *   1. Fetch the latest canonical block stored in block_metadata.
 *   2. Ask the RPC node for the canonical block hash at that block number.
 *   3. If hashes match → no reorg.
 *   4. If hashes differ → walk back one block at a time (using stored
 *      parent_block_hash) until we find the common ancestor, up to
 *      `maxRollbackDepth` blocks.
 */
export class ReorgDetector {
  constructor(
    private readonly blockMetadataStore: BlockMetadataStore,
    private readonly reader: BlockchainReader,
    private readonly config: ReorgDetectorConfig,
  ) {}

  /**
   * Checks whether a reorg has occurred relative to the latest stored block.
   *
   * @param db DatabaseContext used for reads.
   * @returns ReorgCheckResult — either no reorg, or the block to roll back to.
   */
  public async check(db: DatabaseContext): Promise<ReorgCheckResult> {
    const latestStored = await this.blockMetadataStore.getLatestCanonicalBlock(
      db,
      this.config.chainId,
    );

    // No blocks indexed yet — nothing to check.
    if (!latestStored) {
      return { reorgDetected: false };
    }

    // Ask the RPC for the canonical block hash at the stored block number.
    let rpcBlock: { hash: string; parentHash: string };
    try {
      rpcBlock = await this.reader.getBlockByNumber(latestStored.blockNumber);
    } catch (error) {
      throw new ReorgError(
        `Failed to fetch canonical block ${latestStored.blockNumber} from RPC`,
        error,
      );
    }

    // Hashes match — the stored block is canonical. No reorg.
    if (rpcBlock.hash.toLowerCase() === latestStored.blockHash.toLowerCase()) {
      return { reorgDetected: false };
    }

    // Hashes differ — walk back to find the common ancestor.
    return this.findCommonAncestor(db, latestStored.blockNumber);
  }

  /**
   * Walks backwards from `divergedBlockNumber` to locate the last block
   * where stored and RPC hashes agree.
   */
  private async findCommonAncestor(
    db: DatabaseContext,
    divergedBlockNumber: number,
  ): Promise<ReorgCheckResult> {
    const minBlock = Math.max(0, divergedBlockNumber - this.config.maxRollbackDepth);

    for (let blockNum = divergedBlockNumber; blockNum >= minBlock; blockNum--) {
      const stored = await this.blockMetadataStore.getBlockByNumber(
        db,
        this.config.chainId,
        blockNum,
      );
      if (!stored) {
        // We ran out of stored history — roll back to the previous block.
        return { reorgDetected: true, rollbackToBlock: blockNum - 1 };
      }

      let rpcBlock: { hash: string; parentHash: string };
      try {
        rpcBlock = await this.reader.getBlockByNumber(blockNum);
      } catch (error) {
        throw new ReorgError(
          `Failed to fetch block ${blockNum} from RPC during common ancestor search`,
          error,
        );
      }

      if (rpcBlock.hash.toLowerCase() === stored.blockHash.toLowerCase()) {
        // Found the common ancestor.
        return { reorgDetected: true, rollbackToBlock: blockNum };
      }
    }

    // Exceeded maxRollbackDepth — roll back to the minimum safe block.
    return { reorgDetected: true, rollbackToBlock: minBlock };
  }
}

// ---------------------------------------------------------------------------
// ReorgManager
// ---------------------------------------------------------------------------

/**
 * Orchestrates the canonical chain recovery sequence after a reorg is detected.
 *
 * Recovery steps (all within a single database transaction):
 *   1. Mark block_metadata rows above the common ancestor as is_canonical = FALSE.
 *   2. Reset the indexer checkpoint to the common ancestor.
 *
 * Protocol records (deposits, trades, etc.) are NEVER deleted or modified.
 * They remain accessible by querying raw tables without the canonical join.
 */
export class ReorgManager {
  constructor(
    private readonly blockMetadataStore: BlockMetadataStore,
    private readonly checkpointStore: CheckpointStore,
  ) {}

  /**
   * Marks all blocks above `rollbackToBlock` as non-canonical and resets
   * the checkpoint. Must be called inside a database transaction.
   *
   * @param db DatabaseContext (must be a transaction context).
   * @param chainId EVM chain ID.
   * @param indexerName Name of the indexer whose checkpoint should be reset.
   * @param rollbackToBlock The last known good (common ancestor) block number.
   */
  public async markNonCanonical(
    db: DatabaseContext,
    chainId: number,
    indexerName: string,
    rollbackToBlock: number,
  ): Promise<void> {
    try {
      // Step 1: Invalidate orphaned block metadata.
      // Blocks strictly above rollbackToBlock are part of the orphaned fork.
      await this.blockMetadataStore.markNonCanonical(db, chainId, rollbackToBlock + 1);

      // Step 2: Reset checkpoint to the common ancestor so the pipeline
      // replays from rollbackToBlock + 1 on the next iteration.
      await this.checkpointStore.saveCheckpoint(db, indexerName, chainId, rollbackToBlock);
    } catch (error) {
      if (error instanceof ReorgError) throw error;
      throw new ReorgError(
        `Reorg recovery failed: unable to mark non-canonical from block ${rollbackToBlock + 1} on chain ${chainId}`,
        error,
      );
    }
  }
}
