import type { PublicClient } from "viem";
import { RpcError } from "./errors.js";

/**
 * Standardized block log structure returned by the BlockchainReader.
 * This decouples the indexer and downstream logic from direct viem/web3 types.
 */
export interface BlockchainLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: bigint;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  blockHash: string;
}

/**
 * Interface representing the core blockchain RPC reader contract.
 * Decouples the application from the underlying Web3 library (Viem).
 */
export interface BlockchainReader {
  /**
   * Retrieves the current block height of the blockchain network.
   * @throws {RpcError} If the RPC call fails.
   */
  getLatestBlockNumber(): Promise<bigint>;

  /**
   * Fetches event logs matching the specified query filters.
   * @param params Filtering criteria containing block boundaries, addresses, and topics.
   * @throws {RpcError} If the RPC call fails.
   */
  getLogs(params: {
    fromBlock: bigint;
    toBlock: bigint;
    address?: string | string[];
    topics?: string[];
  }): Promise<BlockchainLog[]>;

  /**
   * Returns the minimal block header for reorg detection: the block hash and
   * the parent block hash for the given block number.
   *
   * @param blockNumber The block height to retrieve.
   * @throws {RpcError} If the RPC call fails or the block does not exist.
   */
  getBlockByNumber(blockNumber: number): Promise<{ hash: string; parentHash: string }>;
}

/**
 * Viem-based implementation of the BlockchainReader.
 * Implements dependency injection for the Viem PublicClient.
 */
export class ViemBlockchainReader implements BlockchainReader {
  private client: PublicClient;

  /**
   * @param client An instantiated Viem PublicClient.
   */
  constructor(client: PublicClient) {
    if (!client) {
      throw new Error("Viem PublicClient is required to initialize ViemBlockchainReader");
    }
    this.client = client;
  }

  /**
   * Retrieves the latest block number.
   */
  public async getLatestBlockNumber(): Promise<bigint> {
    try {
      const blockNumber = await this.client.getBlockNumber();
      return blockNumber;
    } catch (error) {
      throw new RpcError("Failed to fetch latest block number from RPC", error);
    }
  }

  /**
   * Retrieves historical logs within the block range.
   */
  public async getLogs(params: {
    fromBlock: bigint;
    toBlock: bigint;
    address?: string | string[];
    topics?: string[];
  }): Promise<BlockchainLog[]> {
    try {
      const { fromBlock, toBlock, address, topics } = params;

      const formattedAddress = address as `0x${string}` | `0x${string}`[] | undefined;
      const formattedTopics = topics as `0x${string}`[] | undefined;

      // biome-ignore lint/suspicious/noExplicitAny: bypassed viem getLogs strict union typing for raw topics
      const args: any = {
        fromBlock,
        toBlock,
        address: formattedAddress,
        topics: formattedTopics,
      };

      const rawLogs = await this.client.getLogs(args);

      return (
        rawLogs as unknown as Array<{
          address: string;
          topics: string[];
          data: string;
          blockNumber: bigint;
          transactionHash: string;
          transactionIndex: number;
          logIndex: number;
          blockHash: string;
        }>
      ).map((log) => ({
        address: log.address.toLowerCase(),
        topics: log.topics || [],
        data: log.data || "0x",
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        transactionIndex: log.transactionIndex,
        logIndex: log.logIndex,
        blockHash: log.blockHash,
      }));
    } catch (error) {
      throw new RpcError("Failed to fetch logs from RPC", error, {
        fromBlock: params.fromBlock.toString(),
        toBlock: params.toBlock.toString(),
        address: params.address,
      });
    }
  }

  /**
   * Retrieves the hash and parent hash for a specific block number.
   */
  public async getBlockByNumber(
    blockNumber: number,
  ): Promise<{ hash: string; parentHash: string }> {
    try {
      const block = await this.client.getBlock({
        blockNumber: BigInt(blockNumber),
        includeTransactions: false,
      });
      return {
        hash: (block.hash as string).toLowerCase(),
        parentHash: (block.parentHash as string).toLowerCase(),
      };
    } catch (error) {
      throw new RpcError(`Failed to fetch block ${blockNumber} from RPC`, error);
    }
  }
}
