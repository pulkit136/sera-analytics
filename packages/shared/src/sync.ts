import { ValidationError } from "./errors.js";

/**
 * Input parameters for calculating the next block synchronization range.
 */
export interface SyncInput {
  /** The block height from which indexing should start if no state exists. */
  startBlock: number;
  /** The latest block height currently confirmed on the blockchain. */
  latestBlock: number;
  /** The block height up to which the indexer has successfully processed logs, or null if starting fresh. */
  currentIndexedBlock: number | null;
  /** The maximum number of blocks that can be processed in a single batch. */
  batchSize: number;
}

/**
 * Output range and state status for block synchronization.
 */
export interface SyncOutput {
  /** The starting block height for the next indexing batch (inclusive). */
  nextFromBlock: number;
  /** The ending block height for the next indexing batch (inclusive). */
  nextToBlock: number;
  /** True if the calculated range caught up to the latest chain block. */
  isCaughtUp: boolean;
  /** The number of remaining blocks left to index after this batch. */
  remainingBlocks: number;
}

/**
 * Deterministically calculates the next block range to process.
 * This is a pure function that does not execute side effects (RPC calls or DB transactions).
 *
 * @param input The configuration and current state values.
 * @throws {ValidationError} If any input value is invalid or negative.
 */
export function calculateSyncRange(input: SyncInput): SyncOutput {
  const { startBlock, latestBlock, currentIndexedBlock, batchSize } = input;

  // 1. Inputs Validation
  if (!Number.isInteger(startBlock) || startBlock < 0) {
    throw new ValidationError("startBlock must be a non-negative integer", { startBlock });
  }

  if (!Number.isInteger(latestBlock) || latestBlock < 0) {
    throw new ValidationError("latestBlock must be a non-negative integer", { latestBlock });
  }

  if (currentIndexedBlock !== null) {
    if (!Number.isInteger(currentIndexedBlock) || currentIndexedBlock < 0) {
      throw new ValidationError("currentIndexedBlock must be a non-negative integer or null", {
        currentIndexedBlock,
      });
    }
  }

  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new ValidationError("batchSize must be an integer greater than zero", { batchSize });
  }

  // 2. Resolve Starting Position
  const fromBlock = currentIndexedBlock === null ? startBlock : currentIndexedBlock + 1;

  // 3. Edge Case: Latest block is behind the starting block height (e.g. empty chain or config ahead of head)
  if (latestBlock < fromBlock) {
    return {
      nextFromBlock: fromBlock,
      nextToBlock: fromBlock - 1, // Represents an empty range [fromBlock, fromBlock - 1]
      isCaughtUp: true,
      remainingBlocks: 0,
    };
  }

  // 4. Calculate Ending Block based on batch size limits
  const candidateToBlock = fromBlock + batchSize - 1;
  const toBlock = Math.min(candidateToBlock, latestBlock);

  // 5. Build Sync Output Details
  const remainingBlocks = latestBlock - toBlock;
  const isCaughtUp = toBlock >= latestBlock;

  return {
    nextFromBlock: fromBlock,
    nextToBlock: toBlock,
    isCaughtUp,
    remainingBlocks,
  };
}
