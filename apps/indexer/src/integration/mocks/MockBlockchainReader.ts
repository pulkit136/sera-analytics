import type { BlockchainLog, BlockchainReader } from "@sera/contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A minimal block header as needed by reorg detection.
 */
export interface MockBlock {
  hash: string;
  parentHash: string;
}

/**
 * A named chain state: a sequence of blocks, each carrying its header
 * and any logs emitted in that block.
 */
export interface MockChain {
  /** Ordered block descriptors, from lowest to highest block number. */
  blocks: Array<{
    blockNumber: number;
    blockHash: string;
    parentHash: string;
    logs: BlockchainLog[];
  }>;
}

// ---------------------------------------------------------------------------
// MockBlockchainReader
// ---------------------------------------------------------------------------

/**
 * Deterministic, in-memory implementation of the BlockchainReader interface.
 *
 * Intended exclusively for integration testing. Instantiated with a MockChain
 * that describes a fixed set of blocks and their logs. Both `getLatestBlockNumber`
 * and `getLogs` derive their answers from this static dataset — no RPC, no
 * randomness, no wall-clock time.
 *
 * Optional `failOnBlock` causes `getLogs` to throw a synthetic RpcError when
 * the requested range covers that block number, enabling crash-recovery tests.
 */
export class MockBlockchainReader implements BlockchainReader {
  private chain: MockChain;
  private failOnBlock?: number;
  private failOnBlockCalled = false;

  constructor(chain: MockChain, failOnBlock?: number) {
    this.chain = chain;
    this.failOnBlock = failOnBlock;
  }

  /**
   * Returns the highest block number present in the fixture chain.
   */
  async getLatestBlockNumber(): Promise<bigint> {
    if (this.chain.blocks.length === 0) return 0n;
    const last = this.chain.blocks[this.chain.blocks.length - 1];
    return BigInt(last.blockNumber);
  }

  /**
   * Returns all logs from blocks whose block number falls within [fromBlock, toBlock].
   * Throws a synthetic RpcError if failOnBlock is configured and lies within the range.
   * The error fires only once; subsequent calls proceed normally (simulates transient failure).
   */
  async getLogs(params: {
    fromBlock: bigint;
    toBlock: bigint;
    address?: string | string[];
    topics?: string[];
  }): Promise<BlockchainLog[]> {
    const from = Number(params.fromBlock);
    const to = Number(params.toBlock);

    // Simulate a one-time transient failure for crash-recovery testing.
    if (
      this.failOnBlock !== undefined &&
      !this.failOnBlockCalled &&
      this.failOnBlock >= from &&
      this.failOnBlock <= to
    ) {
      this.failOnBlockCalled = true;
      throw new Error(`MockBlockchainReader: simulated RPC failure on block ${this.failOnBlock}`);
    }

    const logs: BlockchainLog[] = [];
    for (const block of this.chain.blocks) {
      if (block.blockNumber >= from && block.blockNumber <= to) {
        logs.push(...block.logs);
      }
    }
    return logs;
  }

  /**
   * Returns the hash and parentHash for the given block number.
   * Throws if the block does not exist in the fixture chain.
   */
  async getBlockByNumber(blockNumber: number): Promise<{ hash: string; parentHash: string }> {
    const block = this.chain.blocks.find((b) => b.blockNumber === blockNumber);
    if (!block) {
      throw new Error(`MockBlockchainReader: block ${blockNumber} not found in fixture chain`);
    }
    return { hash: block.blockHash, parentHash: block.parentHash };
  }
}
