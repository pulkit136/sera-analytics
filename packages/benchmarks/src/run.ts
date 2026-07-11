import { performance } from "node:perf_hooks";
import {
  DefaultMetadataPipeline,
  DefaultMetadataProcessorRegistry,
  ERC20MetadataProcessor,
} from "@sera/metadata";
import type {
  ERC20MetadataProvider,
  ERC20ProviderResult,
  MetadataQueue,
  MetadataQueueItem,
  MetadataRepository,
  TokenIdentifier,
  TokenMetadata,
} from "@sera/metadata";
import { InMemoryMetricRecorder } from "@sera/observability";

// ---------------------------------------------------------------------------
// Mock Implementations for Offline Benchmarking
// ---------------------------------------------------------------------------

class MockProvider implements ERC20MetadataProvider {
  public async fetchMetadata(token: TokenIdentifier): Promise<ERC20ProviderResult> {
    return {
      status: "success",
      name: "Benchmark Token",
      symbol: "BMK",
      decimals: 18,
    };
  }
}

class MockMetadataRepository implements MetadataRepository {
  private records = new Map<string, TokenMetadata>();

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

class MockMetadataQueue implements MetadataQueue {
  private items: MetadataQueueItem[] = [];

  public async enqueue(db: unknown, items: MetadataQueueItem[]): Promise<void> {
    this.items.push(...items);
  }

  public async nextPending(db: unknown, limit: number): Promise<MetadataQueueItem[]> {
    return this.items.slice(0, limit);
  }

  public async markCompleted(db: unknown, chainId: number, tokenAddress: string): Promise<void> {
    this.items = this.items.filter((i) => i.tokenAddress !== tokenAddress);
  }

  public async markFailed(
    db: unknown,
    chainId: number,
    tokenAddress: string,
    error: string,
    nextRunAt: Date,
  ): Promise<void> {
    const item = this.items.find((i) => i.tokenAddress === tokenAddress);
    if (item) {
      (item as unknown as Record<string, unknown>).status = "Failed";
    }
  }

  public async exists(db: unknown, chainId: number, tokenAddress: string): Promise<boolean> {
    return this.items.some((i) => i.tokenAddress === tokenAddress);
  }
}

// ---------------------------------------------------------------------------
// Benchmark Runners
// ---------------------------------------------------------------------------

async function runProcessorBenchmark(iterations: number): Promise<void> {
  const provider = new MockProvider();
  const recorder = new InMemoryMetricRecorder();
  const processor = new ERC20MetadataProcessor(provider, recorder);
  const token: TokenIdentifier = { chainId: 1, address: "0x123" };

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await processor.process(null, token);
  }
  const duration = performance.now() - start;
  const opsPerSec = (iterations / duration) * 1000;

  console.log(
    `- Processor throughput: ${opsPerSec.toFixed(2)} ops/sec (total duration: ${duration.toFixed(2)}ms)`,
  );
}

async function runRepositoryBenchmark(iterations: number): Promise<void> {
  const repository = new MockMetadataRepository();
  const token: TokenIdentifier = { chainId: 1, address: "0x123" };
  const metadata: TokenMetadata = {
    identifier: token,
    name: "USD Coin",
    symbol: "USDC",
    decimals: 6,
    logoUri: null,
    source: "OnChain",
    fetchedAt: new Date(0).toISOString(),
    isComplete: true,
    blockNumberObserved: 1000,
  };

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await repository.upsert(null, metadata);
    await repository.find(null, token);
  }
  const duration = performance.now() - start;
  const opsPerSec = (iterations / duration) * 1000;

  console.log(
    `- Repository read/write: ${opsPerSec.toFixed(2)} ops/sec (total duration: ${duration.toFixed(2)}ms)`,
  );
}

async function runPipelineBenchmark(iterations: number): Promise<void> {
  const provider = new MockProvider();
  const recorder = new InMemoryMetricRecorder();
  const processor = new ERC20MetadataProcessor(provider, recorder);
  const registry = new DefaultMetadataProcessorRegistry();
  registry.register(processor);

  const queue = new MockMetadataQueue();
  const repo = new MockMetadataRepository();
  const pipeline = new DefaultMetadataPipeline(queue, repo, registry, recorder);

  // Enqueue test items
  const items: MetadataQueueItem[] = [];
  for (let i = 0; i < iterations; i++) {
    items.push({
      chainId: 1,
      tokenAddress: `0xAddress${i}`,
      enrichmentType: "ERC20",
      status: "Pending",
      attemptCount: 0,
      runAt: new Date(0).toISOString(),
      lastError: null,
      blockNumberObserved: 1000,
    });
  }
  await queue.enqueue(null, items);

  const start = performance.now();
  await pipeline.processQueue(null, iterations);
  const duration = performance.now() - start;
  const opsPerSec = (iterations / duration) * 1000;

  console.log(
    `- Metadata pipeline throughput: ${opsPerSec.toFixed(2)} tokens/sec (total duration: ${duration.toFixed(2)}ms)`,
  );
}

// ---------------------------------------------------------------------------
// Execution Entrypoint
// ---------------------------------------------------------------------------

async function main() {
  console.log("=====================================================================");
  console.log("Starting Offline Deterministic Observability Benchmarks");
  console.log("=====================================================================");

  const iterations = 5000;
  console.log(`Running benchmarks with ${iterations} iterations per component...\n`);

  try {
    await runProcessorBenchmark(iterations);
    await runRepositoryBenchmark(iterations);
    await runPipelineBenchmark(iterations);
  } catch (error) {
    console.error("Benchmark execution failed:", error);
    process.exit(1);
  }

  console.log("=====================================================================");
  console.log("Benchmarks Completed Successfully.");
  console.log("=====================================================================");
}

main().catch(console.error);
