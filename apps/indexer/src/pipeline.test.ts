import {
  type BlockchainLog,
  type BlockchainReader,
  DecoderError,
  type EventDecoder,
  type EventNormalizer,
  type NormalizedRecord,
  NormalizerError,
  RpcError,
  type SeraEvent,
} from "@sera/contracts";
import {
  type CheckpointStore,
  type DatabaseContext,
  PersistenceError,
  type RecordRepository,
} from "@sera/database";
import type { Kysely } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { IndexingPipeline } from "./pipeline.js";

describe("IndexingPipeline Unit Tests", () => {
  const baseConfig = {
    startBlock: 1000,
    batchSize: 100,
    contractAddresses: ["0xC7d4Fd2638e6630C8C61329878676b88A8A24D43"],
    currentIndexedBlock: null,
  };

  const createMocks = () => {
    const reader = {
      getLatestBlockNumber: vi.fn(),
      getLogs: vi.fn(),
    } as unknown as BlockchainReader & {
      getLatestBlockNumber: import("vitest").Mock;
      getLogs: import("vitest").Mock;
    };

    const decoder = {
      decode: vi.fn(),
    } as unknown as EventDecoder & {
      decode: import("vitest").Mock;
    };

    const normalizer = {
      normalize: vi.fn(),
    } as unknown as EventNormalizer & {
      normalize: import("vitest").Mock;
    };

    const repository = {
      saveRecords: vi.fn().mockResolvedValue({
        inserted: [],
        updated: [],
        skipped: [],
        statistics: { insertedCount: 0, updatedCount: 0, skippedCount: 0 },
      }),
    } as unknown as RecordRepository & {
      saveRecords: import("vitest").Mock;
    };

    return { reader, decoder, normalizer, repository };
  };

  it("should successfully execute a full iteration and return correct summary statistics", async () => {
    const { reader, decoder, normalizer, repository } = createMocks();
    const pipeline = new IndexingPipeline(reader, decoder, normalizer, repository);

    reader.getLatestBlockNumber.mockResolvedValue(1050n);

    const mockLogs: BlockchainLog[] = [
      {
        address: "0xC7d4Fd2638e6630C8C61329878676b88A8A24D43",
        blockNumber: 1010n,
        transactionHash: "0xtx",
        logIndex: 0,
        topics: ["0xtopic"],
        data: "0xdata",
        blockHash: "0xbh",
      },
    ];
    reader.getLogs.mockResolvedValue(mockLogs);

    const mockEvent: SeraEvent = {
      type: "Deposited",
      contractAddress: "0xC7d4Fd2638e6630C8C61329878676b88A8A24D43",
      blockNumber: 1010n,
      transactionHash: "0xtx",
      logIndex: 0,
      topics: ["0xtopic"],
      data: "0xdata",
      blockHash: "0xbh",
      args: { token: "0xt", user: "0xu", amount: 100n },
    };
    decoder.decode.mockReturnValue(mockEvent);

    const mockRecords = [
      { recordType: "deposit", tx_hash: "0xtx", block_number: 1010 },
      { recordType: "user", wallet_address: "0xu" },
    ] as unknown as NormalizedRecord[];
    normalizer.normalize.mockReturnValue(mockRecords);

    repository.saveRecords.mockResolvedValue({
      inserted: mockRecords,
      updated: [],
      skipped: [],
      statistics: { insertedCount: 2, updatedCount: 0, skippedCount: 0 },
    });

    const result = await pipeline.execute(baseConfig);

    expect(result.fromBlock).toBe(1000);
    expect(result.toBlock).toBe(1050);
    expect(result.latestChainBlock).toBe(1050);
    expect(result.logsFetched).toBe(1);
    expect(result.eventsDecoded).toBe(1);
    expect(result.unknownEvents).toBe(0);
    expect(result.normalizedRecords).toBe(2);
    expect(result.persistenceStatistics.insertedCount).toBe(2);
    expect(result.remainingBlocks).toBe(0);
    expect(result.caughtUp).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    // Verify ordering interaction
    expect(reader.getLatestBlockNumber).toHaveBeenCalledTimes(1);
    expect(reader.getLogs).toHaveBeenCalledTimes(1);
    expect(decoder.decode).toHaveBeenCalledWith(mockLogs[0], baseConfig.chainId);
    expect(normalizer.normalize).toHaveBeenCalledWith(mockEvent);
    expect(repository.saveRecords).toHaveBeenCalledWith(expect.any(Object), mockRecords);
  });

  it("should early exit with zero counts when there is no work remaining", async () => {
    const { reader, decoder, normalizer, repository } = createMocks();
    const pipeline = new IndexingPipeline(reader, decoder, normalizer, repository);

    reader.getLatestBlockNumber.mockResolvedValue(1000n);

    const result = await pipeline.execute({
      ...baseConfig,
      currentIndexedBlock: 1000,
    });

    expect(result.logsFetched).toBe(0);
    expect(result.eventsDecoded).toBe(0);
    expect(result.caughtUp).toBe(true);
    expect(reader.getLogs).not.toHaveBeenCalled();
    expect(repository.saveRecords).not.toHaveBeenCalled();
  });

  it("should correctly count and log unknown events without mapping them", async () => {
    const { reader, decoder, normalizer, repository } = createMocks();
    const pipeline = new IndexingPipeline(reader, decoder, normalizer, repository);

    reader.getLatestBlockNumber.mockResolvedValue(1050n);

    const mockLogs: BlockchainLog[] = [
      {
        address: "0xC7d4Fd2638e6630C8C61329878676b88A8A24D43",
        blockNumber: 1010n,
        transactionHash: "0xtx",
        logIndex: 0,
        topics: ["0xtopic"],
        data: "0xdata",
        blockHash: "0xbh",
      },
    ];
    reader.getLogs.mockResolvedValue(mockLogs);

    const mockEvent: SeraEvent = {
      type: "UnknownEvent",
      contractAddress: "0xC7d4Fd2638e6630C8C61329878676b88A8A24D43",
      blockNumber: 1010n,
      transactionHash: "0xtx",
      logIndex: 0,
      topics: ["0xtopic"],
      data: "0xdata",
      blockHash: "0xbh",
      args: {},
    };
    decoder.decode.mockReturnValue(mockEvent);
    normalizer.normalize.mockReturnValue([]); // Returns empty for unknown events

    repository.saveRecords.mockResolvedValue({
      inserted: [],
      updated: [],
      skipped: [],
      statistics: { insertedCount: 0, updatedCount: 0, skippedCount: 0 },
    });

    const result = await pipeline.execute(baseConfig);

    expect(result.eventsDecoded).toBe(0);
    expect(result.unknownEvents).toBe(1);
    expect(result.normalizedRecords).toBe(0);
  });

  it("should handle empty log batches successfully and skip persistence writes", async () => {
    const { reader, decoder, normalizer, repository } = createMocks();
    const pipeline = new IndexingPipeline(reader, decoder, normalizer, repository);

    reader.getLatestBlockNumber.mockResolvedValue(1050n);
    reader.getLogs.mockResolvedValue([]); // No logs

    repository.saveRecords.mockResolvedValue({
      inserted: [],
      updated: [],
      skipped: [],
      statistics: { insertedCount: 0, updatedCount: 0, skippedCount: 0 },
    });

    const result = await pipeline.execute(baseConfig);

    expect(result.logsFetched).toBe(0);
    expect(result.eventsDecoded).toBe(0);
    expect(result.normalizedRecords).toBe(0);
    expect(repository.saveRecords).toHaveBeenCalledWith(expect.any(Object), []);
  });

  it("should propagate RPC errors and halt execution before log fetching or decoding", async () => {
    const { reader, decoder, normalizer, repository } = createMocks();
    const pipeline = new IndexingPipeline(reader, decoder, normalizer, repository);

    reader.getLatestBlockNumber.mockRejectedValue(new RpcError("Failed to fetch block head"));

    await expect(pipeline.execute(baseConfig)).rejects.toThrow(RpcError);
    expect(reader.getLogs).not.toHaveBeenCalled();
    expect(decoder.decode).not.toHaveBeenCalled();
    expect(repository.saveRecords).not.toHaveBeenCalled();
  });

  it("should propagate Decoder errors and halt execution before persistence is attempted", async () => {
    const { reader, decoder, normalizer, repository } = createMocks();
    const pipeline = new IndexingPipeline(reader, decoder, normalizer, repository);

    reader.getLatestBlockNumber.mockResolvedValue(1050n);

    const mockLogs = [
      {
        address: "0xC7d4Fd2638e6630C8C61329878676b88A8A24D43",
        blockNumber: 1010n,
        transactionHash: "0xtx",
        logIndex: 0,
        topics: [],
        data: "0x",
        blockHash: "0xbh",
      },
    ];
    reader.getLogs.mockResolvedValue(mockLogs);
    decoder.decode.mockImplementation(() => {
      throw new DecoderError("Corrupt block ABI data");
    });

    await expect(pipeline.execute(baseConfig)).rejects.toThrow(DecoderError);
    expect(normalizer.normalize).not.toHaveBeenCalled();
    expect(repository.saveRecords).not.toHaveBeenCalled();
  });

  it("should propagate Normalizer errors and halt execution before persistence is attempted", async () => {
    const { reader, decoder, normalizer, repository } = createMocks();
    const pipeline = new IndexingPipeline(reader, decoder, normalizer, repository);

    reader.getLatestBlockNumber.mockResolvedValue(1050n);

    const mockLogs = [
      {
        address: "0xC7d4Fd2638e6630C8C61329878676b88A8A24D43",
        blockNumber: 1010n,
        transactionHash: "0xtx",
        logIndex: 0,
        topics: [],
        data: "0x",
        blockHash: "0xbh",
      },
    ];
    reader.getLogs.mockResolvedValue(mockLogs);
    decoder.decode.mockReturnValue({
      type: "Deposited",
      contractAddress: "0xC7d4Fd2638e6630C8C61329878676b88A8A24D43",
      blockNumber: 1010n,
      transactionHash: "0xtx",
      logIndex: 0,
      topics: [],
      data: "0x",
      blockHash: "0xbh",
      args: { token: "0xt", user: "0xu", amount: 100n },
    });
    normalizer.normalize.mockImplementation(() => {
      throw new NormalizerError("Failed to map values");
    });

    await expect(pipeline.execute(baseConfig)).rejects.toThrow(NormalizerError);
    expect(repository.saveRecords).not.toHaveBeenCalled();
  });

  it("should propagate Persistence errors when database write transactions fail", async () => {
    const { reader, decoder, normalizer, repository } = createMocks();
    const pipeline = new IndexingPipeline(reader, decoder, normalizer, repository);

    reader.getLatestBlockNumber.mockResolvedValue(1050n);
    reader.getLogs.mockResolvedValue([
      {
        address: "0xC7d4Fd2638e6630C8C61329878676b88A8A24D43",
        blockNumber: 1010n,
        transactionHash: "0xtx",
        logIndex: 0,
        topics: [],
        data: "0x",
        blockHash: "0xbh",
      },
    ]);
    decoder.decode.mockReturnValue({
      type: "Deposited",
      contractAddress: "0xC7d4Fd2638e6630C8C61329878676b88A8A24D43",
      blockNumber: 1010n,
      transactionHash: "0xtx",
      logIndex: 0,
      topics: [],
      data: "0x",
      blockHash: "0xbh",
      args: { token: "0xt", user: "0xu", amount: 100n },
    });
    normalizer.normalize.mockReturnValue([
      { recordType: "deposit", tx_hash: "0xtx", block_number: 1010 } as unknown as NormalizedRecord,
    ]);
    repository.saveRecords.mockRejectedValue(new PersistenceError("Database connection lost"));

    await expect(pipeline.execute(baseConfig)).rejects.toThrow(PersistenceError);
  });

  describe("Transactional Checkpointing Unit Tests", () => {
    const createCheckpointMocks = () => {
      const { reader, decoder, normalizer, repository } = createMocks();

      const checkpointStore = {
        getCheckpoint: vi.fn(),
        saveCheckpoint: vi.fn(),
      } as unknown as CheckpointStore & {
        getCheckpoint: import("vitest").Mock;
        saveCheckpoint: import("vitest").Mock;
      };

      const mockTrx = {} as unknown as DatabaseContext;
      const db = {
        transaction: () => ({
          execute: async (cb: (trx: DatabaseContext) => Promise<unknown>) => cb(mockTrx),
        }),
      } as unknown as Kysely<unknown>;

      return { reader, decoder, normalizer, repository, checkpointStore, db, mockTrx };
    };

    it("should read from checkpoint on first run (empty database)", async () => {
      const { reader, decoder, normalizer, repository, checkpointStore, db } =
        createCheckpointMocks();
      const pipeline = new IndexingPipeline(
        reader,
        decoder,
        normalizer,
        repository,
        checkpointStore,
        db,
      );

      reader.getLatestBlockNumber.mockResolvedValue(1050n);
      reader.getLogs.mockResolvedValue([]);
      checkpointStore.getCheckpoint.mockResolvedValue(null); // Empty DB

      const result = await pipeline.execute({
        ...baseConfig,
        indexerName: "test-indexer",
        chainId: 1,
        currentIndexedBlock: undefined, // Let it fetch
      });

      expect(checkpointStore.getCheckpoint).toHaveBeenCalledWith(db, "test-indexer", 1);
      expect(result.fromBlock).toBe(1000); // Starts from startBlock
    });

    it("should successfully execute writes and advance checkpoint inside a single transaction context", async () => {
      const { reader, decoder, normalizer, repository, checkpointStore, db, mockTrx } =
        createCheckpointMocks();
      const pipeline = new IndexingPipeline(
        reader,
        decoder,
        normalizer,
        repository,
        checkpointStore,
        db,
      );

      reader.getLatestBlockNumber.mockResolvedValue(1050n);

      const mockLogs: BlockchainLog[] = [
        {
          address: "0xC7d4Fd2638e6630C8C61329878676b88A8A24D43",
          blockNumber: 1010n,
          transactionHash: "0xtx",
          logIndex: 0,
          topics: [],
          data: "0x",
          blockHash: "0xbh",
        },
      ];
      reader.getLogs.mockResolvedValue(mockLogs);

      decoder.decode.mockReturnValue({
        type: "Deposited",
        args: { token: "0xt", user: "0xu", amount: 100n },
      } as unknown as SeraEvent);

      const mockRecords = [{ recordType: "deposit" } as unknown as NormalizedRecord];
      normalizer.normalize.mockReturnValue(mockRecords);

      checkpointStore.getCheckpoint.mockResolvedValue(1000); // Previous checkpoint

      repository.saveRecords.mockResolvedValue({
        inserted: [],
        updated: [],
        skipped: [],
        statistics: { insertedCount: 1, updatedCount: 0, skippedCount: 0 },
      });

      await pipeline.execute({
        ...baseConfig,
        indexerName: "test-indexer",
        chainId: 1,
        currentIndexedBlock: undefined,
      });

      expect(checkpointStore.getCheckpoint).toHaveBeenCalledWith(db, "test-indexer", 1);
      expect(repository.saveRecords).toHaveBeenCalledWith(mockTrx, mockRecords);
      expect(checkpointStore.saveCheckpoint).toHaveBeenCalledWith(mockTrx, "test-indexer", 1, 1050);
    });

    it("should fail transaction and rollback both records and checkpoint when repository throws", async () => {
      const { reader, decoder, normalizer, repository, checkpointStore, db, mockTrx } =
        createCheckpointMocks();
      const pipeline = new IndexingPipeline(
        reader,
        decoder,
        normalizer,
        repository,
        checkpointStore,
        db,
      );

      reader.getLatestBlockNumber.mockResolvedValue(1050n);
      reader.getLogs.mockResolvedValue([
        {
          address: "0xC7d4Fd2638e6630C8C61329878676b88A8A24D43",
          blockNumber: 1010n,
          transactionHash: "0xtx",
          logIndex: 0,
          topics: [],
          data: "0x",
          blockHash: "0xbh",
        },
      ]);
      decoder.decode.mockReturnValue({ type: "Deposited", args: {} } as unknown as SeraEvent);
      normalizer.normalize.mockReturnValue([
        { recordType: "deposit" } as unknown as NormalizedRecord,
      ]);

      checkpointStore.getCheckpoint.mockResolvedValue(1000);
      repository.saveRecords.mockRejectedValue(new Error("Database disk full"));

      await expect(
        pipeline.execute({
          ...baseConfig,
          indexerName: "test-indexer",
          chainId: 1,
          currentIndexedBlock: undefined,
        }),
      ).rejects.toThrow("Database disk full");

      expect(repository.saveRecords).toHaveBeenCalledWith(mockTrx, expect.any(Array));
      expect(checkpointStore.saveCheckpoint).not.toHaveBeenCalled(); // Rollback!
    });
  });
});
