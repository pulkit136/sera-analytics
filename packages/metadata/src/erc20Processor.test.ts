import { describe, expect, it } from "vitest";
import {
  DefaultMetadataPipeline,
  DefaultMetadataProcessorRegistry,
  ERC20MetadataProcessor,
  InvalidMetadataError,
  ProviderError,
} from "./index.js";
import type {
  ERC20MetadataProvider,
  ERC20ProviderResult,
  MetadataQueue,
  MetadataQueueItem,
  MetadataRepository,
  TokenIdentifier,
  TokenMetadata,
} from "./index.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

class MockERC20Provider implements ERC20MetadataProvider {
  public mockResult: ERC20ProviderResult = {
    status: "success",
    name: "Mock Token",
    symbol: "MCK",
    decimals: 18,
  };

  public async fetchMetadata(token: TokenIdentifier): Promise<ERC20ProviderResult> {
    return this.mockResult;
  }
}

class MockMetadataQueue implements MetadataQueue {
  public items: MetadataQueueItem[] = [];
  public completedTokens: string[] = [];
  public failedTokens: Array<{ address: string; error: string }> = [];

  public async enqueue(db: unknown, items: MetadataQueueItem[]): Promise<void> {
    this.items.push(...items);
  }

  public async nextPending(db: unknown, limit: number): Promise<MetadataQueueItem[]> {
    return this.items.slice(0, limit);
  }

  public async markCompleted(db: unknown, chainId: number, tokenAddress: string): Promise<void> {
    this.completedTokens.push(tokenAddress);
    this.items = this.items.filter((i) => i.tokenAddress !== tokenAddress);
  }

  public async markFailed(
    db: unknown,
    chainId: number,
    tokenAddress: string,
    error: string,
    nextRunAt: Date,
  ): Promise<void> {
    this.failedTokens.push({ address: tokenAddress, error });
  }

  public async exists(db: unknown, chainId: number, tokenAddress: string): Promise<boolean> {
    return this.items.some((i) => i.tokenAddress === tokenAddress);
  }
}

class MockMetadataRepository implements MetadataRepository {
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

describe("ERC20MetadataProcessor Unit Tests", () => {
  const token: TokenIdentifier = {
    chainId: 1,
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  };

  it("should successfully process and normalize standard ERC20 metadata", async () => {
    const provider = new MockERC20Provider();
    provider.mockResult = {
      status: "success",
      name: "   USD Coin   ", // spaces to trim
      symbol: " USDC ",
      decimals: 6,
    };

    const processor = new ERC20MetadataProcessor(provider);
    const metadata = await processor.process(null, token);

    expect(metadata.isComplete).toBe(true);
    expect(metadata.name).toBe("USD Coin");
    expect(metadata.symbol).toBe("USDC");
    expect(metadata.decimals).toBe(6);
    expect(metadata.source).toBe("OnChain");
  });

  it("should normalize empty strings and whitespace-only strings to null", async () => {
    const provider = new MockERC20Provider();
    provider.mockResult = {
      status: "success",
      name: "     ",
      symbol: "",
      decimals: 18,
    };

    const processor = new ERC20MetadataProcessor(provider);
    const metadata = await processor.process(null, token);

    expect(metadata.name).toBeNull();
    expect(metadata.symbol).toBeNull();
    expect(metadata.decimals).toBe(18);
  });

  it("should throw InvalidMetadataError if decimals is out of range or not an integer", async () => {
    const provider = new MockERC20Provider();
    const processor = new ERC20MetadataProcessor(provider);

    // 1. Negative decimals
    provider.mockResult = { status: "success", name: "Token", symbol: "TKN", decimals: -1 };
    await expect(processor.process(null, token)).rejects.toThrow(InvalidMetadataError);

    // 2. Decimals > 255
    provider.mockResult = { status: "success", name: "Token", symbol: "TKN", decimals: 256 };
    await expect(processor.process(null, token)).rejects.toThrow(InvalidMetadataError);

    // 3. Fractional decimals
    provider.mockResult = { status: "success", name: "Token", symbol: "TKN", decimals: 18.5 };
    await expect(processor.process(null, token)).rejects.toThrow(InvalidMetadataError);
  });

  it("should return isComplete = false when the contract is unsupported", async () => {
    const provider = new MockERC20Provider();
    provider.mockResult = {
      status: "unsupported",
      reason: "NotAContract",
    };

    const processor = new ERC20MetadataProcessor(provider);
    const metadata = await processor.process(null, token);

    expect(metadata.isComplete).toBe(false);
    expect(metadata.name).toBeNull();
    expect(metadata.symbol).toBeNull();
    expect(metadata.decimals).toBeNull();
  });

  it("should throw ProviderError when transient failure occurs", async () => {
    const provider = new MockERC20Provider();
    provider.mockResult = {
      status: "failure",
      error: "429 Too Many Requests",
      isTransient: true,
    };

    const processor = new ERC20MetadataProcessor(provider);
    await expect(processor.process(null, token)).rejects.toThrow(ProviderError);
  });

  it("should integrate with registry and pipeline correctly", async () => {
    const provider = new MockERC20Provider();
    provider.mockResult = {
      status: "success",
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
    };

    const processor = new ERC20MetadataProcessor(provider);
    const registry = new DefaultMetadataProcessorRegistry();
    registry.register(processor);

    const queue = new MockMetadataQueue();
    const repo = new MockMetadataRepository();
    const pipeline = new DefaultMetadataPipeline(queue, repo, registry);

    // Seed queue item
    await queue.enqueue(null, [
      {
        chainId: 1,
        tokenAddress: token.address,
        enrichmentType: "ERC20",
        status: "Pending",
        attemptCount: 0,
        runAt: new Date(0).toISOString(),
        lastError: null,
        blockNumberObserved: 12345, // Should be filled in final metadata
      },
    ]);

    // Run pipeline queue processing
    await pipeline.processQueue(null, 10);

    expect(queue.completedTokens).toContain(token.address);
    const saved = await repo.find(null, token);
    expect(saved).not.toBeNull();
    expect(saved!.isComplete).toBe(true);
    expect(saved!.decimals).toBe(6);
    expect(saved!.blockNumberObserved).toBe(12345); // deterministic block from queue item!
  });
});
