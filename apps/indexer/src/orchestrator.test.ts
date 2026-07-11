import type { BlockchainLog, BlockchainReader } from "@sera/contracts";
import { RpcError } from "@sera/contracts";
import { describe, expect, it, vi } from "vitest";
import { SyncOrchestrator } from "./orchestrator.js";

/** Minimal BlockchainReader stub satisfying the full interface. */
function makeReader(overrides: Partial<BlockchainReader> = {}): BlockchainReader {
  return {
    getLatestBlockNumber: vi.fn().mockResolvedValue(150n),
    getLogs: vi.fn().mockResolvedValue([]),
    getBlockByNumber: vi.fn().mockResolvedValue({ hash: "0xabc", parentHash: "0x000" }),
    ...overrides,
  };
}

describe("SyncOrchestrator Unit Tests", () => {
  it("should handle the 'no work remaining' (already caught up) scenario", async () => {
    const mockReader = makeReader({
      getLatestBlockNumber: vi.fn().mockResolvedValue(150n),
    });

    const orchestrator = new SyncOrchestrator(mockReader);
    const result = await orchestrator.executeIteration({
      startBlock: 100,
      currentIndexedBlock: 150,
      batchSize: 10,
      contractAddresses: ["0xaddress"],
    });

    expect(result).toEqual({
      fromBlock: 151,
      toBlock: 150,
      logs: [],
      latestBlock: 150,
      remainingBlocks: 0,
      isCaughtUp: true,
    });

    expect(mockReader.getLatestBlockNumber).toHaveBeenCalledTimes(1);
    expect(mockReader.getLogs).not.toHaveBeenCalled();
  });

  it("should perform first sync iteration correctly", async () => {
    const mockLogs: BlockchainLog[] = [
      {
        address: "0xaddress",
        topics: ["0xabc"],
        data: "0x123",
        blockNumber: 105n,
        transactionHash: "0xhash",
        transactionIndex: 0,
        logIndex: 0,
        blockHash: "0xblock",
      },
    ];

    const mockReader = makeReader({
      getLatestBlockNumber: vi.fn().mockResolvedValue(150n),
      getLogs: vi.fn().mockResolvedValue(mockLogs),
    });

    const orchestrator = new SyncOrchestrator(mockReader);
    const result = await orchestrator.executeIteration({
      startBlock: 100,
      currentIndexedBlock: null,
      batchSize: 10,
      contractAddresses: ["0xaddress"],
      topics: ["0xabc"],
    });

    expect(result).toEqual({
      fromBlock: 100,
      toBlock: 109,
      logs: mockLogs,
      latestBlock: 150,
      remainingBlocks: 41,
      isCaughtUp: false,
    });

    expect(mockReader.getLatestBlockNumber).toHaveBeenCalledTimes(1);
    expect(mockReader.getLogs).toHaveBeenCalledWith({
      fromBlock: 100n,
      toBlock: 109n,
      address: ["0xaddress"],
      topics: ["0xabc"],
    });
  });

  it("should handle partial batch execution (caught up range)", async () => {
    const mockLogs: BlockchainLog[] = [];
    const mockReader = makeReader({
      getLatestBlockNumber: vi.fn().mockResolvedValue(105n),
      getLogs: vi.fn().mockResolvedValue(mockLogs),
    });

    const orchestrator = new SyncOrchestrator(mockReader);
    const result = await orchestrator.executeIteration({
      startBlock: 100,
      currentIndexedBlock: null,
      batchSize: 10,
      contractAddresses: ["0xaddress"],
    });

    expect(result).toEqual({
      fromBlock: 100,
      toBlock: 105,
      logs: mockLogs,
      latestBlock: 105,
      remainingBlocks: 0,
      isCaughtUp: true,
    });

    expect(mockReader.getLogs).toHaveBeenCalledWith({
      fromBlock: 100n,
      toBlock: 105n,
      address: ["0xaddress"],
      topics: undefined,
    });
  });

  it("should handle multiple batches remaining case", async () => {
    const mockReader = makeReader({
      getLatestBlockNumber: vi.fn().mockResolvedValue(300n),
      getLogs: vi.fn().mockResolvedValue([]),
    });

    const orchestrator = new SyncOrchestrator(mockReader);
    const result = await orchestrator.executeIteration({
      startBlock: 100,
      currentIndexedBlock: 150,
      batchSize: 50,
      contractAddresses: ["0xaddress"],
    });

    expect(result).toEqual({
      fromBlock: 151,
      toBlock: 200,
      logs: [],
      latestBlock: 300,
      remainingBlocks: 100,
      isCaughtUp: false,
    });
  });

  it("should bubble up RPC failures while reading latest block", async () => {
    const rpcError = new RpcError("Node is down");
    const mockReader = makeReader({
      getLatestBlockNumber: vi.fn().mockRejectedValue(rpcError),
    });

    const orchestrator = new SyncOrchestrator(mockReader);

    await expect(
      orchestrator.executeIteration({
        startBlock: 100,
        currentIndexedBlock: null,
        batchSize: 10,
        contractAddresses: ["0xaddress"],
      }),
    ).rejects.toThrow(rpcError);
  });

  it("should bubble up RPC failures while fetching logs", async () => {
    const rpcError = new RpcError("Filter rejected by node");
    const mockReader = makeReader({
      getLatestBlockNumber: vi.fn().mockResolvedValue(150n),
      getLogs: vi.fn().mockRejectedValue(rpcError),
    });

    const orchestrator = new SyncOrchestrator(mockReader);

    await expect(
      orchestrator.executeIteration({
        startBlock: 100,
        currentIndexedBlock: null,
        batchSize: 10,
        contractAddresses: ["0xaddress"],
      }),
    ).rejects.toThrow(rpcError);
  });

  it("should throw error if initialized with empty reader", () => {
    expect(() => new SyncOrchestrator(null as unknown as BlockchainReader)).toThrow();
  });
});
