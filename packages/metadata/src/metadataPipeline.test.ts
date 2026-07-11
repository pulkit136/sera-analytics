import { describe, expect, it, vi } from "vitest";
import { DefaultMetadataPipeline, DefaultMetadataProcessorRegistry } from "./index.js";
import type {
  DiscoveredToken,
  DiscoveryBatch,
  MetadataProcessor,
  MetadataQueue,
  MetadataQueueItem,
  MetadataRepository,
  TokenIdentifier,
  TokenMetadata,
} from "./index.js";

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

class MockMetadataQueue implements MetadataQueue {
  public items: MetadataQueueItem[] = [];
  public enqueuedItems: MetadataQueueItem[] = [];
  public completedTokens: string[] = [];
  public failedTokens: Array<{ address: string; error: string; runAt: Date }> = [];

  public async enqueue(db: unknown, items: MetadataQueueItem[]): Promise<void> {
    this.enqueuedItems.push(...items);
    this.items.push(...items);
  }

  public async nextPending(db: unknown, limit: number): Promise<MetadataQueueItem[]> {
    return this.items
      .filter((item) => item.status !== "Dead" && new Date(item.runAt).getTime() <= Date.now())
      .slice(0, limit);
  }

  public async markCompleted(db: unknown, chainId: number, tokenAddress: string): Promise<void> {
    this.completedTokens.push(tokenAddress);
    this.items = this.items.filter(
      (item) => !(item.chainId === chainId && item.tokenAddress === tokenAddress),
    );
  }

  public async markFailed(
    db: unknown,
    chainId: number,
    tokenAddress: string,
    error: string,
    nextRunAt: Date,
  ): Promise<void> {
    this.failedTokens.push({ address: tokenAddress, error, runAt: nextRunAt });
    this.items = this.items.map((item) => {
      if (item.chainId === chainId && item.tokenAddress === tokenAddress) {
        const attemptCount = item.attemptCount + 1;
        return {
          ...item,
          attemptCount,
          status: attemptCount >= 5 ? "Dead" : "Failed",
          runAt: nextRunAt.toISOString(),
          lastError: error,
        };
      }
      return item;
    });
  }

  public async exists(db: unknown, chainId: number, tokenAddress: string): Promise<boolean> {
    return this.items.some(
      (item) => item.chainId === chainId && item.tokenAddress === tokenAddress,
    );
  }
}

class MockMetadataRepository implements MockMetadataRepository {
  public records = new Map<string, TokenMetadata>();

  public async upsert(db: unknown, metadata: TokenMetadata): Promise<void> {
    this.records.set(`${metadata.identifier.chainId}:${metadata.identifier.address}`, metadata);
  }

  public async upsertMany(db: unknown, metadata: TokenMetadata[]): Promise<void> {
    for (const m of metadata) {
      await this.upsert(db, m);
    }
  }

  public async find(db: unknown, token: TokenIdentifier): Promise<TokenMetadata | null> {
    return this.records.get(`${token.chainId}:${token.address}`) || null;
  }

  public async exists(db: unknown, token: TokenIdentifier): Promise<boolean> {
    return this.records.has(`${token.chainId}:${token.address}`);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Metadata Pipeline Unit Tests", () => {
  const chainId = 1;
  const mockTokenAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

  it("should filter out already known repository tokens and already queued tokens during enqueueBatch", async () => {
    const queue = new MockMetadataQueue();
    const repo = new MockMetadataRepository();
    const registry = new DefaultMetadataProcessorRegistry();
    const pipeline = new DefaultMetadataPipeline(queue, repo, registry);

    // 1. Seed repository with one known token
    const mockToken: TokenIdentifier = { chainId, address: mockTokenAddress };
    await repo.upsert(null, {
      identifier: mockToken,
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
      logoUri: null,
      source: "OnChain",
      fetchedAt: new Date().toISOString(),
      isComplete: true,
      blockNumberObserved: 100,
    });

    // 2. Seed queue with one queued token
    const queuedAddress = "0xdac17f958d2ee523a2206206994597c13d831ec7";
    await queue.enqueue(null, [
      {
        chainId,
        tokenAddress: queuedAddress,
        enrichmentType: "ERC20",
        status: "Pending",
        attemptCount: 0,
        runAt: new Date(0).toISOString(),
        lastError: null,
        blockNumberObserved: 101,
      },
    ]);

    // 3. Discovery batch containing:
    //    - mockTokenAddress (in repository)
    //    - queuedAddress (in queue)
    //    - newAddress (completely unseen)
    const newAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
    const batch: DiscoveryBatch = {
      chainId,
      blockStart: 100,
      blockEnd: 110,
      tokens: [
        {
          chainId,
          tokenAddress: mockTokenAddress,
          blockNumber: 105,
          reason: "Swap",
          source: { recordId: "1", txHash: "0x1", logIndex: 0 },
        },
        {
          chainId,
          tokenAddress: queuedAddress,
          blockNumber: 106,
          reason: "Deposit",
          source: { recordId: "2", txHash: "0x2", logIndex: 1 },
        },
        {
          chainId,
          tokenAddress: newAddress,
          blockNumber: 107,
          reason: "Deposit",
          source: { recordId: "3", txHash: "0x3", logIndex: 2 },
        },
      ],
    };

    await pipeline.enqueueBatch(null, batch);

    // Only newAddress should have been enqueued
    expect(queue.enqueuedItems).toHaveLength(2); // Initial seeded item + 1 new item enqueued
    expect(queue.enqueuedItems[1].tokenAddress).toBe(newAddress);
  });

  it("should process pending queue items, invoke registry capability, write repository, and delete job on success", async () => {
    const queue = new MockMetadataQueue();
    const repo = new MockMetadataRepository();
    const registry = new DefaultMetadataProcessorRegistry();
    const pipeline = new DefaultMetadataPipeline(queue, repo, registry);

    const tokenAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

    // Register ERC20 processor capability
    const mockProcessor: MetadataProcessor = {
      enrichmentType: "ERC20",
      process: async (db, token) => ({
        identifier: token,
        symbol: "WETH",
        name: "Wrapped Ether",
        decimals: 18,
        logoUri: null,
        source: "OnChain",
        fetchedAt: new Date(0).toISOString(),
        isComplete: true,
        blockNumberObserved: 200,
      }),
    };
    registry.register(mockProcessor);

    // Enqueue pending item
    await queue.enqueue(null, [
      {
        chainId,
        tokenAddress,
        enrichmentType: "ERC20",
        status: "Pending",
        attemptCount: 0,
        runAt: new Date(0).toISOString(),
        lastError: null,
        blockNumberObserved: 200,
      },
    ]);

    await pipeline.processQueue(null, 10);

    // Assert successfully enriched and updated
    expect(queue.completedTokens).toContain(tokenAddress);
    expect(queue.items).toHaveLength(0); // removed on success

    const metadata = await repo.find(null, { chainId, address: tokenAddress });
    expect(metadata).not.toBeNull();
    expect(metadata!.symbol).toBe("WETH");
    expect(metadata!.decimals).toBe(18);
  });

  it("should bound execution to the specified maxItems limit", async () => {
    const queue = new MockMetadataQueue();
    const repo = new MockMetadataRepository();
    const registry = new DefaultMetadataProcessorRegistry();
    const pipeline = new DefaultMetadataPipeline(queue, repo, registry);

    // Register ERC20 processor capability
    const mockProcessor: MetadataProcessor = {
      enrichmentType: "ERC20",
      process: async (db, token) => ({
        identifier: token,
        symbol: "TST",
        name: "Test",
        decimals: 18,
        logoUri: null,
        source: "OnChain",
        fetchedAt: new Date(0).toISOString(),
        isComplete: true,
        blockNumberObserved: 200,
      }),
    };
    registry.register(mockProcessor);

    await queue.enqueue(null, [
      {
        chainId,
        tokenAddress: "0x1",
        enrichmentType: "ERC20",
        status: "Pending",
        attemptCount: 0,
        runAt: new Date(0).toISOString(),
        lastError: null,
        blockNumberObserved: 200,
      },
      {
        chainId,
        tokenAddress: "0x2",
        enrichmentType: "ERC20",
        status: "Pending",
        attemptCount: 0,
        runAt: new Date(0).toISOString(),
        lastError: null,
        blockNumberObserved: 200,
      },
    ]);

    // Process only 1 item
    await pipeline.processQueue(null, 1);

    expect(queue.completedTokens).toHaveLength(1);
    expect(queue.items).toHaveLength(1); // 1 item remains in queue
  });

  it("should handle processor failure, schedule retry, and transition status", async () => {
    const queue = new MockMetadataQueue();
    const repo = new MockMetadataRepository();
    const registry = new DefaultMetadataProcessorRegistry();
    const pipeline = new DefaultMetadataPipeline(queue, repo, registry);

    const tokenAddress = "0x555";

    // Register processor that rejects/fails
    const mockProcessor: MetadataProcessor = {
      enrichmentType: "ERC20",
      process: async () => {
        throw new Error("RPC rate limit exceeded");
      },
    };
    registry.register(mockProcessor);

    await queue.enqueue(null, [
      {
        chainId,
        tokenAddress,
        enrichmentType: "ERC20",
        status: "Pending",
        attemptCount: 0,
        runAt: new Date(0).toISOString(),
        lastError: null,
        blockNumberObserved: 500,
      },
    ]);

    await pipeline.processQueue(null, 10);

    // Job should remain in queue, marked Failed with populated error and incremented attempts
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0].status).toBe("Failed");
    expect(queue.items[0].attemptCount).toBe(1);
    expect(queue.items[0].lastError).toBe("RPC rate limit exceeded");
    expect(queue.failedTokens).toHaveLength(1);
    expect(queue.failedTokens[0].address).toBe(tokenAddress);
    expect(queue.failedTokens[0].error).toBe("RPC rate limit exceeded");
  });

  it("should transition status to Dead after max attempts (5 failed attempts)", async () => {
    const queue = new MockMetadataQueue();
    const repo = new MockMetadataRepository();
    const registry = new DefaultMetadataProcessorRegistry();
    const pipeline = new DefaultMetadataPipeline(queue, repo, registry);

    const tokenAddress = "0xDeadToken";

    // Register processor that rejects/fails
    const mockProcessor: MetadataProcessor = {
      enrichmentType: "ERC20",
      process: async () => {
        throw new Error("Invalid contract code");
      },
    };
    registry.register(mockProcessor);

    // Add item that has already failed 4 times
    await queue.enqueue(null, [
      {
        chainId,
        tokenAddress,
        enrichmentType: "ERC20",
        status: "Failed",
        attemptCount: 4,
        runAt: new Date(0).toISOString(),
        lastError: "Invalid contract code",
        blockNumberObserved: 500,
      },
    ]);

    await pipeline.processQueue(null, 10);

    // 5th attempt failure should transition to 'Dead' status
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0].status).toBe("Dead");
    expect(queue.items[0].attemptCount).toBe(5);
  });
});
