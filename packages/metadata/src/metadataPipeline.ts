import {
  type Logger,
  type MetricRecorder,
  NOOP_LOGGER,
  NoopMetricRecorder,
  NoopTracer,
  type Tracer,
} from "@sera/observability";
import type {
  MetadataPipeline,
  MetadataProcessorRegistry,
  MetadataQueue,
  MetadataRepository,
} from "./interfaces.js";
import type { DiscoveryBatch, MetadataQueueItem, TokenIdentifier } from "./types.js";

/**
 * Default metadata pipeline connecting token discovery to metadata enrichment.
 *
 * Implemented as an in-transaction pipeline stage executing within the L1 transaction.
 */
export class DefaultMetadataPipeline implements MetadataPipeline {
  private readonly recorder: MetricRecorder;
  private readonly tracer: Tracer;
  private readonly logger: Logger;

  constructor(
    private readonly queue: MetadataQueue,
    private readonly repository: MetadataRepository,
    private readonly registry: MetadataProcessorRegistry,
    recorder?: MetricRecorder,
    tracer?: Tracer,
    logger?: Logger,
  ) {
    this.recorder = recorder || new NoopMetricRecorder();
    this.tracer = tracer || new NoopTracer();
    this.logger = logger || NOOP_LOGGER;
  }

  /**
   * Consumes a discovery batch, filters out already-known tokens (both in queue and repo),
   * and enqueues the rest as pending metadata jobs.
   */
  public async enqueueBatch(db: unknown, batch: DiscoveryBatch): Promise<void> {
    const newItems: MetadataQueueItem[] = [];

    for (const token of batch.tokens) {
      // 1. Check if token already has metadata persisted
      const tokenIdentifier: TokenIdentifier = {
        chainId: token.chainId,
        address: token.tokenAddress,
      };

      const existsInRepo = await this.repository.exists(db, tokenIdentifier);
      if (existsInRepo) continue;

      // 2. Check if token task is already in queue
      const existsInQueue = await this.queue.exists(db, token.chainId, token.tokenAddress);
      if (existsInQueue) continue;

      // 3. Construct and queue the new item
      newItems.push({
        chainId: token.chainId,
        tokenAddress: token.tokenAddress,
        enrichmentType: "ERC20", // Default enrichment type for discovery rules
        status: "Pending",
        attemptCount: 0,
        runAt: new Date(0).toISOString(), // Eligible for immediate processing
        lastError: null,
        blockNumberObserved: token.blockNumber,
      });
    }

    if (newItems.length > 0) {
      await this.queue.enqueue(db, newItems);
      this.recorder.incrementCounter("discovered_tokens_total", newItems.length);
      this.logger.info("Metadata pipeline: tokens enqueued for enrichment.", {
        enqueuedCount: newItems.length,
        blockStart: batch.blockStart,
        blockEnd: batch.blockEnd,
        chainId: batch.chainId,
      });
    }
  }

  /**
   * Processes a bounded number of pending tasks from the queue.
   */
  public async processQueue(db: unknown, maxItems: number): Promise<void> {
    const items = await this.queue.nextPending(db, maxItems);

    if (items.length > 0) {
      this.logger.debug("Metadata pipeline: processing queue batch.", {
        batchSize: items.length,
      });
    }

    for (const item of items) {
      this.recorder.incrementCounter("metadata_processed_total", 1, {
        enrichmentType: item.enrichmentType,
      });

      const processor = this.registry.getProcessor(item.enrichmentType);

      if (!processor) {
        // No processor registered: treat as a failure with exponential backoff
        const nextRunAt = this.calculateNextRunAt(item.attemptCount);
        this.recorder.incrementCounter("transient_failures_total", 1, {
          enrichmentType: item.enrichmentType,
          reason: "NoProcessor",
        });
        await this.queue.markFailed(
          db,
          item.chainId,
          item.tokenAddress,
          `No processor registered for capability: ${item.enrichmentType}`,
          nextRunAt,
        );
        continue;
      }

      const token: TokenIdentifier = {
        chainId: item.chainId,
        address: item.tokenAddress,
      };

      const span = this.tracer.startSpan("metadata_processing", {
        enrichmentType: item.enrichmentType,
        token: token.address,
      });

      try {
        const procStartTime = performance.now();
        // Invoke capability-specific processor
        const metadata = await processor.process(db, token);
        const procDuration = performance.now() - procStartTime;
        this.recorder.recordHistogram("processor_execution_duration_ms", procDuration, {
          enrichmentType: item.enrichmentType,
        });

        // Fill deterministic block number observed from the L1 queue item
        const enrichedMetadata = {
          ...metadata,
          blockNumberObserved: item.blockNumberObserved,
        };

        const repoStartTime = performance.now();
        // Persist successful enrichment snapshot
        await this.repository.upsert(db, enrichedMetadata);
        const repoDuration = performance.now() - repoStartTime;
        this.recorder.recordHistogram("repository_duration_ms", repoDuration);

        // Mark completed (removes from active queue)
        await this.queue.markCompleted(db, item.chainId, item.tokenAddress);

        if (metadata.isComplete) {
          this.recorder.incrementCounter("metadata_success_total", 1, {
            enrichmentType: item.enrichmentType,
          });
          this.logger.info("Metadata pipeline: token enriched successfully.", {
            tokenAddress: token.address,
            chainId: token.chainId,
            enrichmentType: item.enrichmentType,
            durationMs: procDuration,
          });
        } else {
          this.recorder.incrementCounter("unsupported_tokens_total", 1, {
            enrichmentType: item.enrichmentType,
          });
          this.logger.info("Metadata pipeline: token marked unsupported.", {
            tokenAddress: token.address,
            chainId: token.chainId,
            enrichmentType: item.enrichmentType,
          });
        }

        span.end();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        span.recordException(err);
        span.end();

        // Enrichment failed: record the error and reschedule with operational delay
        const nextRunAt = this.calculateNextRunAt(item.attemptCount);
        const errorMessage = err.message;

        if (item.attemptCount + 1 >= 5) {
          this.recorder.incrementCounter("permanent_failures_total", 1, {
            enrichmentType: item.enrichmentType,
          });
          this.logger.error("Metadata pipeline: token enrichment permanently failed.", {
            tokenAddress: token.address,
            chainId: token.chainId,
            enrichmentType: item.enrichmentType,
            attemptCount: item.attemptCount + 1,
            error: errorMessage,
          });
        } else {
          this.recorder.incrementCounter("transient_failures_total", 1, {
            enrichmentType: item.enrichmentType,
          });
          this.logger.warn("Metadata pipeline: token enrichment failed — will retry.", {
            tokenAddress: token.address,
            chainId: token.chainId,
            enrichmentType: item.enrichmentType,
            attemptCount: item.attemptCount + 1,
            error: errorMessage,
          });
        }

        await this.queue.markFailed(db, item.chainId, item.tokenAddress, errorMessage, nextRunAt);
      }
    }
  }

  /**
   * Calculates the next eligible operational run time using exponential backoff.
   * retry delay = min(initial * 2^(attempt), max)
   */
  private calculateNextRunAt(attemptCount: number): Date {
    const initialDelayMs = 60 * 1000; // 1 minute
    const maxDelayMs = 24 * 60 * 60 * 1000; // 24 hours

    const exponent = Math.min(attemptCount, 30); // Prevent overflow
    const delayMs = Math.min(initialDelayMs * 2 ** exponent, maxDelayMs);

    return new Date(Date.now() + delayMs);
  }
}
