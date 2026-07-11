import type { BlockchainLog, BlockchainReader } from "@sera/contracts";
import { calculateSyncRange } from "@sera/shared";

/**
 * Parameters for a single synchronization iteration check.
 */
export interface SyncIterationInput {
  /** The block height from which indexing should start if no state exists. */
  startBlock: number;
  /** The current block height indexed in the database, or null if starting fresh. */
  currentIndexedBlock: number | null;
  /** The maximum size of the block batch to request. */
  batchSize: number;
  /** Contract addresses to filter logs for. */
  contractAddresses: string[];
  /** Optional event signature topic hashes to filter logs for. */
  topics?: string[];
}

/**
 * The outcome of a single synchronization iteration request.
 */
export interface SyncIterationResult {
  /** The starting block height of the processed batch (inclusive). */
  fromBlock: number;
  /** The ending block height of the processed batch (inclusive). */
  toBlock: number;
  /** Normalized logs fetched from the blockchain during this batch range. */
  logs: BlockchainLog[];
  /** The latest block number retrieved from the blockchain node. */
  latestBlock: number;
  /** The number of remaining blocks left to process after this batch. */
  remainingBlocks: number;
  /** True if the indexing range caught up with the latest blockchain block. */
  isCaughtUp: boolean;
}

/**
 * Coordination layer linking the stateless block synchronization planner with the Web3 RPC layer.
 * Implements exactly one cycle of planning and fetching without state persistence.
 */
export class SyncOrchestrator {
  private reader: BlockchainReader;

  /**
   * @param reader Concrete instance of the BlockchainReader RPC client wrapper.
   */
  constructor(reader: BlockchainReader) {
    if (!reader) {
      throw new Error("BlockchainReader is required to initialize SyncOrchestrator");
    }
    this.reader = reader;
  }

  /**
   * Performs exactly one synchronization query iteration.
   *
   * @param input The iteration boundary parameters.
   * @throws {RpcError} If RPC block reading or log fetching queries fail.
   * @throws {ValidationError} If input configurations are negative or invalid.
   */
  public async executeIteration(input: SyncIterationInput): Promise<SyncIterationResult> {
    // 1. Fetch latest blockchain height
    const latestBlockBigInt = await this.reader.getLatestBlockNumber();
    const latestBlock = Number(latestBlockBigInt);

    // 2. Compute synchronization range targets using the stateless planner
    const range = calculateSyncRange({
      startBlock: input.startBlock,
      latestBlock,
      currentIndexedBlock: input.currentIndexedBlock,
      batchSize: input.batchSize,
    });

    // 3. Early Exit if caught up with no blocks to fetch
    if (range.nextToBlock < range.nextFromBlock) {
      return {
        fromBlock: range.nextFromBlock,
        toBlock: range.nextToBlock,
        logs: [],
        latestBlock,
        remainingBlocks: 0,
        isCaughtUp: true,
      };
    }

    // 4. Fetch normalized logs for the targeted range
    const logs = await this.reader.getLogs({
      fromBlock: BigInt(range.nextFromBlock),
      toBlock: BigInt(range.nextToBlock),
      address: input.contractAddresses,
      topics: input.topics,
    });

    // 5. Output coordination metadata
    return {
      fromBlock: range.nextFromBlock,
      toBlock: range.nextToBlock,
      logs,
      latestBlock,
      remainingBlocks: range.remainingBlocks,
      isCaughtUp: range.isCaughtUp,
    };
  }
}
