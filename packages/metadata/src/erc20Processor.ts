import { type MetricRecorder, NoopMetricRecorder } from "@sera/observability";
import { InvalidMetadataError, ProviderError } from "./errors.js";
import type { ERC20MetadataProvider, MetadataProcessor } from "./interfaces.js";
import type { TokenIdentifier, TokenMetadata } from "./types.js";

/**
 * Deterministic ERC20 token metadata enrichment processor.
 * Invokes the generalized blockchain provider and validates outcomes.
 */
export class ERC20MetadataProcessor implements MetadataProcessor {
  public readonly enrichmentType = "ERC20";
  private readonly recorder: MetricRecorder;

  constructor(
    private readonly provider: ERC20MetadataProvider,
    recorder?: MetricRecorder,
  ) {
    this.recorder = recorder || new NoopMetricRecorder();
  }

  /**
   * Performs standard ERC20 metadata reads and returns a validated TokenMetadata snapshot.
   */
  public async process(db: unknown, token: TokenIdentifier): Promise<TokenMetadata> {
    const result = await this.provider.fetchMetadata(token);

    if (result.status === "failure") {
      // Transient error: propagate ProviderError causing the pipeline to retry
      throw new ProviderError(
        `RPC Provider fetch failed for ERC20: ${result.error}`,
        "ERC20",
        new Error(result.error),
      );
    }

    if (result.status === "unsupported") {
      // Deterministic unsupported outcome: return complete non-compliant snapshot
      return {
        identifier: token,
        name: null,
        symbol: null,
        decimals: null,
        logoUri: null,
        source: "OnChain",
        fetchedAt: new Date(0).toISOString(),
        isComplete: false,
        blockNumberObserved: 0,
      };
    }

    // Success outcome: perform normalization and validation
    const name = this.normalizeString(result.name);
    const symbol = this.normalizeString(result.symbol);
    const decimals = result.decimals;

    // Validation Rules:
    // 1. Decimals must be an integer within [0, 255] (uint8 range)
    if (decimals < 0 || decimals > 255 || !Number.isInteger(decimals)) {
      throw new InvalidMetadataError(`Invalid ERC20 decimals value: ${decimals}`);
    }

    return {
      identifier: token,
      name,
      symbol,
      decimals,
      logoUri: null,
      source: "OnChain",
      fetchedAt: new Date(0).toISOString(), // Pinned timestamp for pure replay guarantees
      isComplete: true,
      blockNumberObserved: 0, // Will be filled/overwritten with L1 observed block number by Pipeline
    };
  }

  private normalizeString(val: string | null): string | null {
    const startTime = performance.now();
    const result = this.normalizeStringInternal(val);
    const durationMs = performance.now() - startTime;
    this.recorder.recordHistogram("normalization_duration_ms", durationMs);
    return result;
  }

  private normalizeStringInternal(val: string | null): string | null {
    if (val === null || val === undefined) return null;
    const trimmed = val.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
}
