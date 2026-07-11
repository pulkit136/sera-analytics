import type { BlockchainLog, BlockchainReader } from "@sera/contracts";
import {
  type BlockMetadata,
  type BlockMetadataStore,
  type CheckpointStore,
  type DatabaseContext,
  ReorgError,
} from "@sera/database";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReorgDetector, ReorgManager } from "./reorg.js";

// ---------------------------------------------------------------------------
// Shared mock factories
// ---------------------------------------------------------------------------

function makeBlockMetadataStore(overrides: Partial<BlockMetadataStore> = {}): BlockMetadataStore {
  return {
    saveBlock: vi.fn().mockResolvedValue(undefined),
    getLatestCanonicalBlock: vi.fn().mockResolvedValue(null),
    getBlockByNumber: vi.fn().mockResolvedValue(null),
    markNonCanonical: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeReader(overrides: Partial<BlockchainReader> = {}): BlockchainReader {
  return {
    getLatestBlockNumber: vi.fn().mockResolvedValue(BigInt(1000)),
    getLogs: vi.fn<() => Promise<BlockchainLog[]>>().mockResolvedValue([]),
    getBlockByNumber: vi.fn().mockResolvedValue({
      hash: "0xabc",
      parentHash: "0x000",
    }),
    ...overrides,
  };
}

function makeCheckpointStore(overrides: Partial<CheckpointStore> = {}): CheckpointStore {
  return {
    getCheckpoint: vi.fn().mockResolvedValue(null),
    saveCheckpoint: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const db = {} as DatabaseContext;

// ---------------------------------------------------------------------------
// ReorgDetector tests
// ---------------------------------------------------------------------------

describe("ReorgDetector", () => {
  const config = { chainId: 1, maxRollbackDepth: 64 };

  it("returns no reorg when no blocks are stored yet", async () => {
    const store = makeBlockMetadataStore({
      getLatestCanonicalBlock: vi.fn().mockResolvedValue(null),
    });
    const detector = new ReorgDetector(store, makeReader(), config);

    const result = await detector.check(db);

    expect(result.reorgDetected).toBe(false);
  });

  it("returns no reorg when stored block hash matches RPC hash", async () => {
    const storedBlock: BlockMetadata = {
      chainId: 1,
      blockNumber: 500,
      blockHash: "0xabc",
      parentBlockHash: "0x000",
      isCanonical: true,
    };

    const store = makeBlockMetadataStore({
      getLatestCanonicalBlock: vi.fn().mockResolvedValue(storedBlock),
    });
    const reader = makeReader({
      getBlockByNumber: vi.fn().mockResolvedValue({
        hash: "0xabc",
        parentHash: "0x000",
      }),
    });

    const detector = new ReorgDetector(store, reader, config);
    const result = await detector.check(db);

    expect(result.reorgDetected).toBe(false);
  });

  it("detects a reorg when stored block hash differs from RPC hash", async () => {
    const storedBlock: BlockMetadata = {
      chainId: 1,
      blockNumber: 500,
      blockHash: "0xold",
      parentBlockHash: "0x000",
      isCanonical: true,
    };

    // Common ancestor found at block 499 (block 499 hashes match)
    const store = makeBlockMetadataStore({
      getLatestCanonicalBlock: vi.fn().mockResolvedValue(storedBlock),
      getBlockByNumber: vi
        .fn()
        .mockImplementation(async (_db: DatabaseContext, _chainId: number, blockNum: number) => {
          if (blockNum === 500) {
            return { ...storedBlock, blockNumber: 500, blockHash: "0xold" };
          }
          if (blockNum === 499) {
            return { ...storedBlock, blockNumber: 499, blockHash: "0xparent" };
          }
          return null;
        }),
    });

    const reader = makeReader({
      // Block 500 differs on chain, block 499 matches
      getBlockByNumber: vi.fn().mockImplementation(async (blockNum: number) => {
        if (blockNum === 500) return { hash: "0xnew500", parentHash: "0xparent" };
        if (blockNum === 499) return { hash: "0xparent", parentHash: "0x000" };
        return { hash: "0x000", parentHash: "0x000" };
      }),
    });

    const detector = new ReorgDetector(store, reader, config);
    const result = await detector.check(db);

    expect(result.reorgDetected).toBe(true);
    if (result.reorgDetected) {
      // Common ancestor found at 499, so rollback to 499
      expect(result.rollbackToBlock).toBe(499);
    }
  });

  it("respects maxRollbackDepth when ancestor not found within depth", async () => {
    const storedBlock: BlockMetadata = {
      chainId: 1,
      blockNumber: 200,
      blockHash: "0xold",
      parentBlockHash: "0x000",
      isCanonical: true,
    };

    // All stored blocks diverge — common ancestor outside depth
    const store = makeBlockMetadataStore({
      getLatestCanonicalBlock: vi.fn().mockResolvedValue(storedBlock),
      getBlockByNumber: vi.fn().mockResolvedValue({
        ...storedBlock,
        blockHash: "0xold",
      }),
    });

    const smallDepthConfig = { chainId: 1, maxRollbackDepth: 3 };
    const reader = makeReader({
      // All blocks differ
      getBlockByNumber: vi.fn().mockResolvedValue({ hash: "0xnew", parentHash: "0x000" }),
    });

    const detector = new ReorgDetector(store, reader, smallDepthConfig);
    const result = await detector.check(db);

    expect(result.reorgDetected).toBe(true);
    if (result.reorgDetected) {
      // Should roll back to max(0, 200 - 3) = 197
      expect(result.rollbackToBlock).toBe(197);
    }
  });

  it("throws ReorgError when RPC call fails", async () => {
    const storedBlock: BlockMetadata = {
      chainId: 1,
      blockNumber: 100,
      blockHash: "0xold",
      parentBlockHash: "0x000",
      isCanonical: true,
    };

    const store = makeBlockMetadataStore({
      getLatestCanonicalBlock: vi.fn().mockResolvedValue(storedBlock),
    });
    const reader = makeReader({
      getBlockByNumber: vi.fn().mockRejectedValue(new Error("RPC timeout")),
    });

    const detector = new ReorgDetector(store, reader, config);

    await expect(detector.check(db)).rejects.toThrow(ReorgError);
  });
});

// ---------------------------------------------------------------------------
// ReorgManager tests
// ---------------------------------------------------------------------------

describe("ReorgManager", () => {
  it("marks blocks non-canonical from rollbackToBlock+1", async () => {
    const store = makeBlockMetadataStore();
    const checkpointStore = makeCheckpointStore();
    const manager = new ReorgManager(store, checkpointStore);

    await manager.markNonCanonical(db, 1, "main-indexer", 499);

    // Blocks >= 500 should be marked non-canonical
    expect(store.markNonCanonical).toHaveBeenCalledWith(db, 1, 500);
  });

  it("resets checkpoint to the common ancestor block", async () => {
    const store = makeBlockMetadataStore();
    const checkpointStore = makeCheckpointStore();
    const manager = new ReorgManager(store, checkpointStore);

    await manager.markNonCanonical(db, 1, "main-indexer", 499);

    expect(checkpointStore.saveCheckpoint).toHaveBeenCalledWith(db, "main-indexer", 1, 499);
  });

  it("throws ReorgError when blockMetadataStore.markNonCanonical fails", async () => {
    const store = makeBlockMetadataStore({
      markNonCanonical: vi.fn().mockRejectedValue(new Error("db down")),
    });
    const checkpointStore = makeCheckpointStore();
    const manager = new ReorgManager(store, checkpointStore);

    await expect(manager.markNonCanonical(db, 1, "main-indexer", 499)).rejects.toThrow(ReorgError);

    // Checkpoint must NOT have been updated after metadata write failed
    expect(checkpointStore.saveCheckpoint).not.toHaveBeenCalled();
  });

  it("throws ReorgError when checkpointStore.saveCheckpoint fails", async () => {
    const store = makeBlockMetadataStore();
    const checkpointStore = makeCheckpointStore({
      saveCheckpoint: vi.fn().mockRejectedValue(new Error("checkpoint write failed")),
    });
    const manager = new ReorgManager(store, checkpointStore);

    await expect(manager.markNonCanonical(db, 1, "main-indexer", 499)).rejects.toThrow(ReorgError);
  });

  it("is idempotent: repeated calls do not throw", async () => {
    const store = makeBlockMetadataStore();
    const checkpointStore = makeCheckpointStore();
    const manager = new ReorgManager(store, checkpointStore);

    await manager.markNonCanonical(db, 1, "main-indexer", 300);
    await manager.markNonCanonical(db, 1, "main-indexer", 300);

    expect(store.markNonCanonical).toHaveBeenCalledTimes(2);
    expect(checkpointStore.saveCheckpoint).toHaveBeenCalledTimes(2);
  });
});
