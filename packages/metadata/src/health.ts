import type { HealthCheck, HealthStatus, InMemoryMetricRecorder } from "@sera/observability";
import type { MetadataQueue } from "./interfaces.js";

/**
 * HealthCheck indicator for Metadata Pipeline execution and queue status.
 */
export class MetadataPipelineHealthCheck implements HealthCheck {
  public readonly name = "metadata_pipeline";

  constructor(
    private readonly queue: MetadataQueue,
    private readonly db: unknown,
    private readonly recorder: InMemoryMetricRecorder,
  ) {}

  public async check(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();

    try {
      // 1. Verify queue responsiveness by performing a dry run query
      await this.queue.nextPending(this.db, 1);

      // 2. Aggregate metrics from the in-memory recorder
      const successCount = this.recorder.counters.get("metadata_success_total") || 0;
      const unsupportedCount = this.recorder.counters.get("unsupported_tokens_total") || 0;
      const transientFailures = this.recorder.counters.get("transient_failures_total") || 0;
      const permanentFailures = this.recorder.counters.get("permanent_failures_total") || 0;
      const processedCount = this.recorder.counters.get("metadata_processed_total") || 0;

      return {
        isHealthy: true,
        timestamp,
        details: {
          queueStatus: "responsive",
          processedCount,
          successCount,
          unsupportedCount,
          transientFailures,
          permanentFailures,
        },
      };
    } catch (error) {
      return {
        isHealthy: false,
        timestamp,
        details: {
          queueStatus: "error",
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
