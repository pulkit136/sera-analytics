// ---------------------------------------------------------------------------
// Primitive identifiers
// ---------------------------------------------------------------------------

/**
 * Uniquely identifies a token within a specific EVM chain.
 * Immutable — values are never mutated after construction.
 */
export interface TokenIdentifier {
  /** EVM chain ID (e.g. 1 for Ethereum mainnet). */
  readonly chainId: number;
  /** Checksummed ERC-20 contract address. */
  readonly address: string;
}

// ---------------------------------------------------------------------------
// Token metadata
// ---------------------------------------------------------------------------

/**
 * The canonical, deterministic metadata record for a single ERC-20 token.
 *
 * All fields that may legitimately be absent are typed as `string | null`
 * rather than `string | undefined` to make the absence explicit and to
 * survive a JSON round-trip without information loss.
 */
export interface TokenMetadata {
  readonly identifier: TokenIdentifier;

  /** Token symbol (e.g. "USDC"). Null if the provider did not return one. */
  readonly symbol: string | null;

  /** Human-readable token name (e.g. "USD Coin"). */
  readonly name: string | null;

  /**
   * Number of decimal places used by the token.
   * Legal ERC-20 range: 0–255.  Null when unavailable.
   */
  readonly decimals: number | null;

  /** URI pointing to the token's logo image, if known. */
  readonly logoUri: string | null;

  /** Which data source produced this record. */
  readonly source: MetadataSource;

  /** ISO 8601 timestamp at which this record was fetched. */
  readonly fetchedAt: string;

  /**
   * True if every required field (symbol, name, decimals) is populated and
   * passes basic sanity checks.  Stored alongside the record so queries can
   * filter incomplete metadata without re-validating.
   */
  readonly isComplete: boolean;

  /** The Layer 1 block height at which this metadata was observed or fetched. */
  readonly blockNumberObserved: number;
}

// ---------------------------------------------------------------------------
// Metadata jobs
// ---------------------------------------------------------------------------

/**
 * All states a MetadataJob may occupy during its lifecycle.
 *
 * State machine:
 *   Pending → Running → Completed
 *                     → Failed → Pending  (retry)
 *                     → Dead            (retry limit reached)
 */
export type MetadataJobStatus = "Pending" | "Running" | "Completed" | "Failed" | "Dead";

/**
 * A unit of enrichment work targeting a single token.
 *
 * Jobs are created by the MetadataScheduler when it detects a new token on
 * a canonical Layer 1 record.  They are immutable once created — retry
 * attempts are tracked separately (see `attemptCount`).
 */
export interface MetadataJob {
  /** Globally unique job identifier (UUID v4). */
  readonly jobId: string;
  /** The token this job must enrich. */
  readonly token: TokenIdentifier;
  /** Current lifecycle state. */
  readonly status: MetadataJobStatus;
  /** Why this job was created. */
  readonly reason: EnrichmentReason;
  /** ISO 8601 timestamp of initial job creation. */
  readonly createdAt: string;
  /** ISO 8601 timestamp of the most recent status update. */
  readonly updatedAt: string;
  /** How many fetch attempts have been made so far (0 = not yet started). */
  readonly attemptCount: number;
  /**
   * ISO 8601 timestamp before which the job must not be retried.
   * Null for newly created or completed jobs.
   */
  readonly retryAfter: string | null;
}

// ---------------------------------------------------------------------------
// Metadata results
// ---------------------------------------------------------------------------

/**
 * The outcome of a single metadata fetch attempt.
 *
 * A result is either a success carrying the enriched token record, or a
 * failure carrying the error that prevented enrichment.  The discriminant
 * field `ok` makes exhaustive handling easy in TypeScript.
 */
export type MetadataResult =
  | {
      readonly ok: true;
      readonly jobId: string;
      readonly token: TokenIdentifier;
      readonly metadata: TokenMetadata;
      readonly durationMs: number;
    }
  | {
      readonly ok: false;
      readonly jobId: string;
      readonly token: TokenIdentifier;
      readonly error: string;
      readonly durationMs: number;
    };

// ---------------------------------------------------------------------------
// Metadata sources
// ---------------------------------------------------------------------------

/**
 * Identifies where a piece of token metadata originated.
 *
 * Sources represent domain-level authority classifications.
 */
export type MetadataSource =
  | "OnChain" // derived deterministically from on-chain contract calls
  | "Registry" // fetched from canonical public token lists/registries
  | "External" // fetched from third-party APIs/indexers
  | "Unknown"; // source not recorded (legacy records)

// ---------------------------------------------------------------------------
// Enrichment reasons
// ---------------------------------------------------------------------------

/**
 * Explains why a MetadataJob was created.
 *
 * Used for observability and to allow schedulers to apply different
 * prioritisation strategies (e.g. tokens seen in a trade may be more urgent
 * than tokens seen in a deposit).
 */
export type EnrichmentReason =
  | "NewTokenSeen" // first appearance of the token address on Layer 1
  | "MetadataStale" // existing record older than the staleness threshold
  | "MetadataIncomplete" // existing record is missing required fields
  | "ManualRefresh"; // triggered explicitly by an operator or admin

// ---------------------------------------------------------------------------
// Checkpointing
// ---------------------------------------------------------------------------

/**
 * Durable progress marker for a named metadata worker.
 *
 * The checkpoint records which Layer 1 block height has been fully scanned
 * for new tokens.  It is persisted atomically with job creation so that
 * a worker restart never skips tokens or creates duplicate jobs.
 */
export interface MetadataCheckpoint {
  /** Name of the worker this checkpoint belongs to. */
  readonly workerName: string;
  /** EVM chain ID being processed. */
  readonly chainId: number;
  /** The highest Layer 1 block fully scanned for new token addresses. */
  readonly lastScannedBlock: number;
  /** ISO 8601 timestamp of the last checkpoint update. */
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// Token Discovery
// ---------------------------------------------------------------------------

/**
 * Contextual rationale for token discovery.
 */
export type DiscoveryReason = "Deposit" | "Withdrawal" | "Swap" | "Trade" | "Other";

/**
 * Identifies the origin of a discovered token.
 */
export interface DiscoverySource {
  readonly recordId: string;
  readonly txHash: string;
  readonly logIndex: number;
}

/**
 * Raw discovery evidence emitted by a rule. Can contain duplicates.
 */
export interface DiscoveryCandidate {
  readonly chainId: number;
  readonly tokenAddress: string;
  readonly blockNumber: number;
  readonly reason: DiscoveryReason;
  readonly source: DiscoverySource;
}

/**
 * Validated, normalized, unique output of discovery processing.
 */
export interface DiscoveredToken {
  readonly chainId: number;
  readonly tokenAddress: string;
  readonly blockNumber: number;
  readonly reason: DiscoveryReason;
  readonly source: DiscoverySource;
}

/**
 * A batch of unique, deduplicated tokens discovered in a block range.
 */
export interface DiscoveryBatch {
  readonly chainId: number;
  readonly blockStart: number;
  readonly blockEnd: number;
  readonly tokens: readonly DiscoveredToken[];
}

// ---------------------------------------------------------------------------
// Metadata Queue
// ---------------------------------------------------------------------------

/**
 * Status lifecycle values for a queued metadata task.
 */
export type MetadataQueueItemStatus = "Pending" | "Failed" | "Dead";

/**
 * A persistent task queued for metadata enrichment.
 */
export interface MetadataQueueItem {
  readonly chainId: number;
  readonly tokenAddress: string;
  readonly enrichmentType: string;
  readonly status: MetadataQueueItemStatus;
  readonly attemptCount: number;
  readonly runAt: string; // ISO 8601 string representation of operational run_at timestamp
  readonly lastError: string | null;
  readonly blockNumberObserved: number;
}
