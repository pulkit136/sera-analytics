import { describe, expect, it, vi } from "vitest";
import { DefaultDiscoveryEngine, DefaultTokenDiscoveryRegistry } from "@sera/metadata";
import {
  DepositDiscoveryRule,
  WithdrawalDiscoveryRule,
  SwapDiscoveryRule,
} from "@sera/metadata";
import { MockBlockchainReader } from "./mocks/MockBlockchainReader.js";
import {
  setupTestDb,
  createProductionPipeline,
  createProductionMetadataPipeline,
  serializeDatabaseState,
  assertDbEquals,
  MockKyselyDatabase,
} from "./helpers.js";
import { replayFixture } from "./fixtures/replay.js";
import { reorgChainA, reorgChainB } from "./fixtures/reorg.js";
import { crashFixture } from "./fixtures/crash.js";
import { mixedFixture } from "./fixtures/mixed.js";
import { emptyBlocksFixture } from "./fixtures/emptyBlocks.js";
import { ADDRESSES, CHAIN_ID, INDEXER_NAME } from "./fixtures/helpers.js";

describe("Deterministic End-to-End Indexing Integration Tests", () => {
  const db = new MockKyselyDatabase();

  it("1. Initial Replay: Runs replay fixture from genesis to latest and verifies DB matches exactly", async () => {
    await setupTestDb(db);

    const reader = new MockBlockchainReader(replayFixture.chain);
    const pipeline = createProductionPipeline(reader, db);

    const result = await pipeline.execute({
      startBlock: 100,
      batchSize: 10,
      contractAddresses: [ADDRESSES.TOKEN_USDC, ADDRESSES.TOKEN_WBTC],
      indexerName: INDEXER_NAME,
      chainId: CHAIN_ID,
    });

    expect(result.fromBlock).toBe(100);
    expect(result.toBlock).toBe(102);
    expect(result.caughtUp).toBe(true);
    expect(result.logsFetched).toBe(2);

    // Verify checkpoint
    const checkpoint = await db
      .selectFrom("checkpoints")
      .selectAll()
      .where("indexer_name", "=", INDEXER_NAME)
      .where("chain_id", "=", CHAIN_ID)
      .executeTakeFirst();
    expect(checkpoint).toBeDefined();
    expect(Number(checkpoint?.latest_indexed_block)).toBe(replayFixture.expectedCheckpoint);

    // Verify deposits
    const deposits = await db
      .selectFrom("raw_deposits")
      .selectAll()
      .orderBy("tx_hash")
      .orderBy("log_index")
      .execute();
    expect(deposits).toHaveLength(replayFixture.expectedDeposits.length);
    for (let i = 0; i < deposits.length; i++) {
      expect(deposits[i].tx_hash).toBe(replayFixture.expectedDeposits[i].tx_hash);
      expect(deposits[i].log_index).toBe(replayFixture.expectedDeposits[i].log_index);
      expect(deposits[i].user_address).toBe(replayFixture.expectedDeposits[i].user_address);
      expect(deposits[i].token_address).toBe(replayFixture.expectedDeposits[i].token_address);
      expect(deposits[i].amount).toBe(replayFixture.expectedDeposits[i].amount);
    }
  });

  it("2. Idempotent Replay: Running the same replay twice results in identical DB snapshots", async () => {
    await setupTestDb(db);

    const reader = new MockBlockchainReader(replayFixture.chain);
    const pipeline = createProductionPipeline(reader, db);

    // Run 1
    await pipeline.execute({
      startBlock: 100,
      batchSize: 10,
      contractAddresses: [ADDRESSES.TOKEN_USDC, ADDRESSES.TOKEN_WBTC],
      indexerName: INDEXER_NAME,
      chainId: CHAIN_ID,
    });
    const snapshot1 = await serializeDatabaseState(db);

    // Run 2 (simulate re-running with same indexed checkpoint override)
    await pipeline.execute({
      startBlock: 100,
      batchSize: 10,
      contractAddresses: [ADDRESSES.TOKEN_USDC, ADDRESSES.TOKEN_WBTC],
      indexerName: INDEXER_NAME,
      chainId: CHAIN_ID,
      currentIndexedBlock: 99, // Force it to re-index from startBlock
    });
    const snapshot2 = await serializeDatabaseState(db);

    expect(snapshot1).toEqual(snapshot2);
  });

  it("3. Crash Recovery: Recovers from RPC error and guarantees atomicity of checkpoint and records", async () => {
    await setupTestDb(db);

    // Mock reader will fail once on block 101
    const reader = new MockBlockchainReader(crashFixture.chain, crashFixture.failOnBlock);
    const pipeline = createProductionPipeline(reader, db);

    // First execute call - should crash on block 101 and fail transaction
    await expect(
      pipeline.execute({
        startBlock: 100,
        batchSize: 10,
        contractAddresses: [ADDRESSES.TOKEN_USDC, ADDRESSES.TOKEN_WBTC],
        indexerName: INDEXER_NAME,
        chainId: CHAIN_ID,
      })
    ).rejects.toThrow();

    // Verify atomicity: block 101 records should NOT be saved, and checkpoint should NOT be updated.
    // Checkpoint should either be null or 99 (startBlock-1 if it was updated at startBlock, but since it failed
    // inside the tx, let's verify what checkpoint and deposits exist).
    const checkpointMid = await db.selectFrom("checkpoints").selectAll().executeTakeFirst();
    const depositsMid = await db.selectFrom("raw_deposits").selectAll().execute();

    // Since block 100 succeeds and processes block 100 (which commits successfully because the logs for range are fetched.
    // Wait, the batch size is 10. So it fetches blocks 100-109 in one batch!
    // Since getLogs fails during the first batch execution for block 101, the entire batch transaction rolls back!
    // Thus, no deposits from block 100 or block 101 are committed.
    expect(checkpointMid).toBeUndefined();
    expect(depositsMid).toHaveLength(0);

    // Second run: mock reader transient error is now resolved. Execution should complete successfully.
    const result = await pipeline.execute({
      startBlock: 100,
      batchSize: 10,
      contractAddresses: [ADDRESSES.TOKEN_USDC, ADDRESSES.TOKEN_WBTC],
      indexerName: INDEXER_NAME,
      chainId: CHAIN_ID,
    });

    expect(result.toBlock).toBe(102);
    expect(result.caughtUp).toBe(true);

    const checkpointFinal = await db
      .selectFrom("checkpoints")
      .select("latest_indexed_block")
      .where("indexer_name", "=", INDEXER_NAME)
      .where("chain_id", "=", CHAIN_ID)
      .executeTakeFirst();
    expect(Number(checkpointFinal?.latest_indexed_block)).toBe(crashFixture.expectedCheckpoint);

    const depositsFinal = await db.selectFrom("raw_deposits").selectAll().execute();
    expect(depositsFinal).toHaveLength(3); // block 100 deposit + block 101 deposit + block 102 deposit
  });

  it("4. Reorganization: Reorganizes block hashes correctly and marks orphaned blocks as non-canonical", async () => {
    await setupTestDb(db);

    // Phase A: sync chain A
    const readerA = new MockBlockchainReader(reorgChainA);
    const pipelineA = createProductionPipeline(readerA, db);
    await pipelineA.execute({
      startBlock: 100,
      batchSize: 10,
      contractAddresses: [ADDRESSES.TOKEN_USDC, ADDRESSES.TOKEN_WBTC],
      indexerName: INDEXER_NAME,
      chainId: CHAIN_ID,
    });

    // Check block 101 hashA is canonical
    const block101A = await db
      .selectFrom("block_metadata")
      .selectAll()
      .where("block_number", "=", 101)
      .where("is_canonical", "=", true)
      .executeTakeFirst();
    expect(block101A?.block_hash).toBe("0xblock101_hasha");

    // Phase B: sync chain B (which triggers reorg since block 102 hash differs)
    const readerB = new MockBlockchainReader(reorgChainB);
    const pipelineB = createProductionPipeline(readerB, db);
    const resultB = await pipelineB.execute({
      startBlock: 100,
      batchSize: 10,
      contractAddresses: [ADDRESSES.TOKEN_USDC, ADDRESSES.TOKEN_WBTC],
      indexerName: INDEXER_NAME,
      chainId: CHAIN_ID,
    });

    expect(resultB.reorgRecovered).toBe(true);
    expect(resultB.toBlock).toBe(103);

    // Verify block 101 hashA is no longer canonical, and block 101 hashB is canonical
    const block101AAfter = await db
      .selectFrom("block_metadata")
      .selectAll()
      .where("block_number", "=", 101)
      .where("block_hash", "=", "0xblock101_hasha")
      .executeTakeFirst();
    expect(block101AAfter?.is_canonical).toBe(false);

    const block101BCanonical = await db
      .selectFrom("block_metadata")
      .selectAll()
      .where("block_number", "=", 101)
      .where("is_canonical", "=", true)
      .executeTakeFirst();
    expect(block101BCanonical?.block_hash).toBe("0xblock101_hashb");

    // Verify we can still query the orphaned block by hash
    const blockOrphaned = await db
      .selectFrom("block_metadata")
      .selectAll()
      .where("block_hash", "=", "0xblock101_hasha")
      .executeTakeFirst();
    expect(blockOrphaned).toBeDefined();
    expect(blockOrphaned?.is_canonical).toBe(false);
  });

  it("5. Metadata Retry: Handles transient RPC errors and completes metadata enrichment on retry", async () => {
    await setupTestDb(db);

    // Step 1: Run indexing on replay fixture to get USDC deposit record in DB
    const reader = new MockBlockchainReader(replayFixture.chain);
    const pipeline = createProductionPipeline(reader, db);
    await pipeline.execute({
      startBlock: 100,
      batchSize: 10,
      contractAddresses: [ADDRESSES.TOKEN_USDC, ADDRESSES.TOKEN_WBTC],
      indexerName: INDEXER_NAME,
      chainId: CHAIN_ID,
    });

    // Step 2: Set up Metadata discovery
    const registry = new DefaultTokenDiscoveryRegistry();
    registry.register(new DepositDiscoveryRule());
    const discoveryEngine = new DefaultDiscoveryEngine(registry);

    // Discover tokens from deposits in DB
    const rawDeposits = await db.selectFrom("raw_deposits").selectAll().execute();
    const deposits = rawDeposits.map(d => ({ ...d, recordType: "deposit" as const }));
    const discoveryBatch = discoveryEngine.discoverTokens(deposits, CHAIN_ID, 100, 102);

    expect(discoveryBatch.tokens).toHaveLength(2); // USDC and WBTC

    // Step 3: Set up Metadata Pipeline with a mock provider that fails once then succeeds
    let usdcCallCount = 0;
    const mockProvider = {
      fetchMetadata: async (token: any) => {
        if (token.address.toLowerCase() === ADDRESSES.TOKEN_USDC.toLowerCase()) {
          usdcCallCount++;
          if (usdcCallCount === 1) {
            throw new Error("Transient RPC error");
          }
          return { status: "success", name: "USD Coin", symbol: "USDC", decimals: 6 };
        }
        return { status: "success", name: "Wrapped BTC", symbol: "WBTC", decimals: 8 };
      },
    };

    const metadataPipeline = createProductionMetadataPipeline(db, mockProvider);

    // Enqueue discovered tokens
    await metadataPipeline.enqueueBatch(db, discoveryBatch);

    // Verify enqueued in queue
    const queuedItems = await db.selectFrom("metadata_queue").selectAll().execute();
    expect(queuedItems).toHaveLength(2);
    expect(queuedItems.map((q) => q.status)).toEqual(["Pending", "Pending"]);

    // Process queue: first USDC processing fails due to transient error, WBTC succeeds
    await metadataPipeline.processQueue(db, 2);

    const queuedAfterFail = await db
      .selectFrom("metadata_queue")
      .selectAll()
      .where("token_address", "=", ADDRESSES.TOKEN_USDC.toLowerCase())
      .executeTakeFirst();
    expect(queuedAfterFail?.status).toBe("Failed");
    expect(queuedAfterFail?.attempt_count).toBe(1);

    // Set USDC item to eligible for retry by updating run_at in DB
    await db
      .updateTable("metadata_queue")
      .set({ run_at: new Date(0) })
      .where("token_address", "=", ADDRESSES.TOKEN_USDC.toLowerCase())
      .execute();

    // Process queue again: USDC succeeds this time
    await metadataPipeline.processQueue(db, 2);

    // Verify both tokens are fully enriched and removed from queue
    const queuedFinal = await db.selectFrom("metadata_queue").selectAll().execute();
    expect(queuedFinal).toHaveLength(0); // Completed items are deleted/removed from queue

    const metadataUSDC = await db
      .selectFrom("token_metadata")
      .selectAll()
      .where("token_address", "=", ADDRESSES.TOKEN_USDC.toLowerCase())
      .executeTakeFirst();
    expect(metadataUSDC?.name).toBe("USD Coin");
    expect(metadataUSDC?.symbol).toBe("USDC");
    expect(Number(metadataUSDC?.decimals)).toBe(6);
  });

  it("6. Permanent Metadata Failure: Marks token as unsupported in token_metadata when provider returns unsupported", async () => {
    await setupTestDb(db);

    const reader = new MockBlockchainReader(replayFixture.chain);
    const pipeline = createProductionPipeline(reader, db);
    await pipeline.execute({
      startBlock: 100,
      batchSize: 10,
      contractAddresses: [ADDRESSES.TOKEN_USDC, ADDRESSES.TOKEN_WBTC],
      indexerName: INDEXER_NAME,
      chainId: CHAIN_ID,
    });

    const registry = new DefaultTokenDiscoveryRegistry();
    registry.register(new DepositDiscoveryRule());
    const discoveryEngine = new DefaultDiscoveryEngine(registry);

    const rawDeposits = await db.selectFrom("raw_deposits").selectAll().execute();
    const deposits = rawDeposits.map(d => ({ ...d, recordType: "deposit" as const }));
    const discoveryBatch = discoveryEngine.discoverTokens(deposits, CHAIN_ID, 100, 102);

    // Mock provider returns unsupported for WBTC, and success for USDC
    const mockProvider = {
      fetchMetadata: async (token: any) => {
        if (token.address.toLowerCase() === ADDRESSES.TOKEN_WBTC.toLowerCase()) {
          return { status: "unsupported", reason: "NotAContract" };
        }
        return { status: "success", name: "USD Coin", symbol: "USDC", decimals: 6 };
      },
    };

    const metadataPipeline = createProductionMetadataPipeline(db, mockProvider);
    await metadataPipeline.enqueueBatch(db, discoveryBatch);
    await metadataPipeline.processQueue(db, 2);

    // WBTC should be saved with null fields (marked unsupported/isComplete=false)
    const metadataWBTC = await db
      .selectFrom("token_metadata")
      .selectAll()
      .where("token_address", "=", ADDRESSES.TOKEN_WBTC.toLowerCase())
      .executeTakeFirst();
    expect(metadataWBTC).toBeDefined();
    expect(metadataWBTC?.name).toBeNull();
    expect(metadataWBTC?.symbol).toBeNull();
    expect(metadataWBTC?.decimals).toBeNull();
  });

  it("7. Empty Blocks: Processes empty blocks correctly advancing checkpoint but inserting zero raw deposits", async () => {
    await setupTestDb(db);

    const reader = new MockBlockchainReader(emptyBlocksFixture.chain);
    const pipeline = createProductionPipeline(reader, db);

    const result = await pipeline.execute({
      startBlock: 300,
      batchSize: 10,
      contractAddresses: [ADDRESSES.TOKEN_USDC],
      indexerName: INDEXER_NAME,
      chainId: CHAIN_ID,
    });

    expect(result.toBlock).toBe(304);
    expect(result.logsFetched).toBe(0);

    const checkpoint = await db
      .selectFrom("checkpoints")
      .select("latest_indexed_block")
      .where("indexer_name", "=", INDEXER_NAME)
      .where("chain_id", "=", CHAIN_ID)
      .executeTakeFirst();
    expect(Number(checkpoint?.latest_indexed_block)).toBe(emptyBlocksFixture.expectedCheckpoint);

    const deposits = await db.selectFrom("raw_deposits").selectAll().execute();
    expect(deposits).toHaveLength(0);
  });

  it("8. Unknown Events: Processes unrecognized logs without throwing", async () => {
    await setupTestDb(db);

    const reader = new MockBlockchainReader(mixedFixture.chain);
    const pipeline = createProductionPipeline(reader, db);

    const result = await pipeline.execute({
      startBlock: 200,
      batchSize: 10,
      contractAddresses: [ADDRESSES.TOKEN_USDC, ADDRESSES.TOKEN_WBTC],
      indexerName: INDEXER_NAME,
      chainId: CHAIN_ID,
    });

    // Verify unknown logs were counted but didn't crash execution
    expect(result.unknownEvents).toBe(1);
    expect(result.eventsDecoded).toBe(3); // deposit, trade, swap
  });

  it("9. Mixed Workload: Accurately parses and stores deposit, withdrawal, and swap logs", async () => {
    await setupTestDb(db);

    const reader = new MockBlockchainReader(mixedFixture.chain);
    const pipeline = createProductionPipeline(reader, db);

    await pipeline.execute({
      startBlock: 200,
      batchSize: 10,
      contractAddresses: [ADDRESSES.TOKEN_USDC, ADDRESSES.TOKEN_WBTC],
      indexerName: INDEXER_NAME,
      chainId: CHAIN_ID,
    });

    const deposits = await db.selectFrom("raw_deposits").selectAll().execute();
    expect(deposits).toHaveLength(1);
    expect(deposits[0].amount).toBe("5000");

    const trades = await db.selectFrom("raw_trades").selectAll().execute();
    expect(trades).toHaveLength(1);
    expect(trades[0].order_hash_0).toBe(mixedFixture.expectedOrderHash0);

    const swaps = await db.selectFrom("raw_swaps").selectAll().execute();
    expect(swaps).toHaveLength(1);
    expect(swaps[0].intent_hash).toBe(mixedFixture.expectedIntentHash);
  });

  it("10. Deterministic Replay (Database A vs Database B): Two runs of mixed workload produce byte-for-byte identical database states", async () => {
    const dbA = new MockKyselyDatabase();
    const dbB = new MockKyselyDatabase();

    // DB A run
    await setupTestDb(dbA);
    const readerA = new MockBlockchainReader(mixedFixture.chain);
    const pipelineA = createProductionPipeline(readerA, dbA);
    await pipelineA.execute({
      startBlock: 200,
      batchSize: 10,
      contractAddresses: [ADDRESSES.TOKEN_USDC, ADDRESSES.TOKEN_WBTC],
      indexerName: INDEXER_NAME,
      chainId: CHAIN_ID,
    });
    const stateA = await serializeDatabaseState(dbA);

    // DB B run
    await setupTestDb(dbB);
    const readerB = new MockBlockchainReader(mixedFixture.chain);
    const pipelineB = createProductionPipeline(readerB, dbB);
    await pipelineB.execute({
      startBlock: 200,
      batchSize: 10,
      contractAddresses: [ADDRESSES.TOKEN_USDC, ADDRESSES.TOKEN_WBTC],
      indexerName: INDEXER_NAME,
      chainId: CHAIN_ID,
    });
    const stateB = await serializeDatabaseState(dbB);

    expect(stateA).toEqual(stateB);
  });
});
