import type { PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import { RpcError } from "./errors.js";
import { ViemBlockchainReader } from "./reader.js";

describe("ViemBlockchainReader Unit Tests", () => {
  it("should successfully retrieve latest block number from client", async () => {
    const mockClient = {
      getBlockNumber: vi.fn().mockResolvedValue(12345n),
    } as unknown as PublicClient;

    const reader = new ViemBlockchainReader(mockClient);
    const blockNumber = await reader.getLatestBlockNumber();

    expect(blockNumber).toBe(12345n);
    expect(mockClient.getBlockNumber).toHaveBeenCalledTimes(1);
  });

  it("should wrap getBlockNumber failures in RpcError with cause preserved", async () => {
    const originalError = new Error("Connection timed out");
    const mockClient = {
      getBlockNumber: vi.fn().mockRejectedValue(originalError),
    } as unknown as PublicClient;

    const reader = new ViemBlockchainReader(mockClient);

    await expect(reader.getLatestBlockNumber()).rejects.toThrow(RpcError);

    try {
      await reader.getLatestBlockNumber();
    } catch (err) {
      const error = err as RpcError;
      expect(error.code).toBe("RPC_ERROR");
      expect(error.context?.cause).toBe(originalError);
    }
  });

  it("should successfully retrieve and normalize logs with correct parameters", async () => {
    const rawLogsMock = [
      {
        address: "0xC7d4Fd2638e6630C8C61329878676b88A8A24D43",
        topics: ["0x9089d3..."],
        data: "0x0001",
        blockNumber: 20000010n,
        transactionHash: "0x1234...",
        transactionIndex: 1,
        logIndex: 0,
        blockHash: "0xabcd...",
      },
    ];

    const mockClient = {
      getLogs: vi.fn().mockResolvedValue(rawLogsMock),
    } as unknown as PublicClient;

    const reader = new ViemBlockchainReader(mockClient);
    const logs = await reader.getLogs({
      fromBlock: 20000000n,
      toBlock: 20000020n,
      address: "0xC7d4Fd2638e6630C8C61329878676b88A8A24D43",
      topics: ["0x9089d3..."],
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toEqual({
      address: "0xc7d4fd2638e6630c8c61329878676b88a8a24d43",
      topics: ["0x9089d3..."],
      data: "0x0001",
      blockNumber: 20000010n,
      transactionHash: "0x1234...",
      transactionIndex: 1,
      logIndex: 0,
      blockHash: "0xabcd...",
    });

    expect(mockClient.getLogs).toHaveBeenCalledWith({
      fromBlock: 20000000n,
      toBlock: 20000020n,
      address: "0xC7d4Fd2638e6630C8C61329878676b88A8A24D43",
      topics: ["0x9089d3..."],
    });
  });

  it("should wrap getLogs failures in RpcError with parameter context preserved", async () => {
    const originalError = new Error("Rate limit exceeded");
    const mockClient = {
      getLogs: vi.fn().mockRejectedValue(originalError),
    } as unknown as PublicClient;

    const reader = new ViemBlockchainReader(mockClient);

    await expect(
      reader.getLogs({
        fromBlock: 100n,
        toBlock: 200n,
        address: "0xaddress",
      }),
    ).rejects.toThrow(RpcError);

    try {
      await reader.getLogs({
        fromBlock: 100n,
        toBlock: 200n,
        address: "0xaddress",
      });
    } catch (err) {
      const error = err as RpcError;
      expect(error.code).toBe("RPC_ERROR");
      expect(error.context?.fromBlock).toBe("100");
      expect(error.context?.toBlock).toBe("200");
      expect(error.context?.address).toBe("0xaddress");
      expect(error.context?.cause).toBe(originalError);
    }
  });

  it("should retrieve block hash and parent hash for a given block number", async () => {
    const mockClient = {
      getBlock: vi.fn().mockResolvedValue({
        hash: "0xABCDEF1234",
        parentHash: "0x000111222",
      }),
    } as unknown as PublicClient;

    const reader = new ViemBlockchainReader(mockClient);
    const block = await reader.getBlockByNumber(500);

    expect(block.hash).toBe("0xabcdef1234");
    expect(block.parentHash).toBe("0x000111222");
    expect(mockClient.getBlock).toHaveBeenCalledWith({
      blockNumber: BigInt(500),
      includeTransactions: false,
    });
  });

  it("should wrap getBlock failures in RpcError", async () => {
    const originalError = new Error("Block not found");
    const mockClient = {
      getBlock: vi.fn().mockRejectedValue(originalError),
    } as unknown as PublicClient;

    const reader = new ViemBlockchainReader(mockClient);

    await expect(reader.getBlockByNumber(999)).rejects.toThrow(RpcError);
  });
});
