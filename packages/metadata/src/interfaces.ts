import type {
  DiscoveredToken,
  DiscoveryBatch,
  DiscoveryCandidate,
  EnrichmentReason,
  MetadataCheckpoint,
  MetadataJob,
  MetadataJobStatus,
  MetadataQueueItem,
  MetadataResult,
  TokenIdentifier,
  TokenMetadata,
} from "./types.js";

// ---------------------------------------------------------------------------
// MetadataProvider
// ---------------------------------------------------------------------------

/**
 * Abstraction over a single external metadata source.
 *
 * Each concrete provider (CoinGecko, TrustWallet, on-chain multicall, …)
 * implements this interface independently.  Providers are stateless and
 * contain no retry logic — that responsibility belongs to the MetadataWorker.
 *
 * A provider MUST NOT:
 *   - persist anything to a database
 *   - emit metrics or side effects
 *   - depend on Kysely, viem, or any other infrastructure library directly
 *     (adapters belong in the implementing package, not here)
 */
export interface MetadataProvider {
  /**
   * Human-readable name used in logging and MetadataSource attribution.
   * Must be stable across restarts (used as a storage key).
   */
  readonly name: string;

  /**
   * Attempts to fetch metadata for the given token.
   *
   * Returns a MetadataResult regardless of outcome — this method should
   * never throw.  All failures must be captured as `{ ok: false, … }`.
   *
   * @param token The token to fetch metadata for.
   */
  fetch(token: TokenIdentifier): Promise<MetadataResult>;

  /**
   * Returns true if this provider supports the given chain ID.
   * Workers use this to skip providers that cannot serve a particular chain.
   */
  supports(chainId: number): boolean;
}

// ---------------------------------------------------------------------------
// RetryPolicy
// ---------------------------------------------------------------------------

/**
 * Encapsulates the rules governing when and how often a failed job is retried.
 *
 * Implementations must be pure and deterministic: given the same inputs,
 * they must always return the same outputs.  This allows retry schedules to
 * be reproduced exactly during replay.
 */
export interface RetryPolicy {
  /**
   * Returns the delay (in milliseconds) to wait before the nth retry attempt.
   * `attempt` is 1-indexed: the first retry has `attempt = 1`.
   *
   * Implementations should impose a maximum delay ceiling.
   */
  delayFor(attempt: number): number;

  /**
   * Returns true if another retry attempt is permitted given the current
   * attempt count.  When this returns false, the job transitions to `Dead`.
   */
  shouldRetry(attempt: number): boolean;
}

// ---------------------------------------------------------------------------
// MetadataWorker
// ---------------------------------------------------------------------------

/**
 * Processes a single MetadataJob end-to-end.
 *
 * A worker is responsible for:
 *   1. Selecting an appropriate MetadataProvider.
 *   2. Invoking the provider to fetch metadata.
 *   3. Validating the result against domain invariants.
 *   4. Persisting the result via the MetadataRepository.
 *   5. Updating the job status accordingly.
 *
 * A worker MUST NOT:
 *   - implement its own retry loop (that belongs to the MetadataScheduler)
 *   - access the database directly (all persistence goes through the repository)
 *   - perform caching (that belongs to the MetadataCache)
 */
export interface MetadataWorker {
  /**
   * Processes a single job.  May throw if an unrecoverable internal error
   * occurs (e.g. repository unavailable).  Transient provider failures are
   * captured in MetadataResult, not re-thrown.
   */
  process(job: MetadataJob): Promise<MetadataResult>;
}

export interface MetadataRepository {
  /**
   * Idempotently persists a single token metadata record, replacing any existing snapshot.
   *
   * @param db Shared DatabaseContext (connection pool or transaction instance).
   * @param metadata Token metadata snapshot to write.
   */
  // biome-ignore lint/suspicious/noExplicitAny: opaque database connection context
  upsert(db: any, metadata: TokenMetadata): Promise<void>;

  /**
   * Idempotently persists a batch of metadata records atomically.
   *
   * @param db Shared DatabaseContext (connection pool or transaction instance).
   * @param metadata Collection of token metadata snapshots to write.
   */
  // biome-ignore lint/suspicious/noExplicitAny: opaque database connection context
  upsertMany(db: any, metadata: TokenMetadata[]): Promise<void>;

  /**
   * Retrieves the stored metadata snapshot for a token, or null if none exists.
   *
   * @param db Shared DatabaseContext.
   * @param token Uniquely identifies the target token.
   */
  // biome-ignore lint/suspicious/noExplicitAny: opaque database connection context
  find(db: any, token: TokenIdentifier): Promise<TokenMetadata | null>;

  /**
   * Returns true if a metadata record exists for the given token.
   *
   * @param db Shared DatabaseContext.
   * @param token Uniquely identifies the target token.
   */
  // biome-ignore lint/suspicious/noExplicitAny: opaque database connection context
  exists(db: any, token: TokenIdentifier): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// MetadataCache
// ---------------------------------------------------------------------------

/**
 * Optional read-through cache layer sitting in front of MetadataRepository.
 *
 * Reduces provider call volume for frequently-queried tokens.  The cache is
 * advisory only — it must never be the sole source of truth for metadata that
 * has been persisted to the repository.
 *
 * The cache MUST be safe to bypass entirely without correctness consequences.
 */
export interface MetadataCache {
  /**
   * Returns the cached metadata for a token, or null if not cached.
   */
  get(token: TokenIdentifier): Promise<TokenMetadata | null>;

  /**
   * Stores metadata in the cache.  Implementations may set an expiry TTL.
   */
  set(token: TokenIdentifier, metadata: TokenMetadata): Promise<void>;

  /**
   * Evicts the cached entry for the given token.
   * Called when metadata is re-fetched or invalidated.
   */
  invalidate(token: TokenIdentifier): Promise<void>;
}

// ---------------------------------------------------------------------------
// BatchExecutor
// ---------------------------------------------------------------------------

/**
 * Executes a collection of metadata jobs concurrently, respecting a
 * configurable concurrency limit and applying back-pressure when the provider
 * rate-limits the caller.
 *
 * Batch semantics:
 *   - All jobs in a batch are independent; a failure in one must not
 *     prevent others from completing.
 *   - Results are collected and returned regardless of individual success/failure.
 */
export interface BatchExecutor {
  /**
   * Executes all jobs in the batch and returns one result per job.
   * Results are returned in the same order as the input jobs array.
   *
   * @param jobs   The jobs to execute.
   * @param worker The worker used to process each job.
   */
  executeBatch(jobs: MetadataJob[], worker: MetadataWorker): Promise<MetadataResult[]>;
}

// ---------------------------------------------------------------------------
// MetadataScheduler
// ---------------------------------------------------------------------------

/**
 * Orchestrates the metadata enrichment lifecycle.
 *
 * Responsibilities:
 *   1. Scanning new canonical Layer 1 records for previously unseen tokens.
 *   2. Creating MetadataJobs for new and stale tokens.
 *   3. Claiming pending jobs and dispatching them to a BatchExecutor.
 *   4. Re-queuing failed jobs according to the RetryPolicy.
 *   5. Advancing the MetadataCheckpointStore after each successful scan.
 *
 * The scheduler MUST NOT:
 *   - perform metadata fetching directly (use a worker/executor)
 *   - implement retry logic (use the RetryPolicy)
 *   - access any data store other than through declared interfaces
 */
export interface MetadataScheduler {
  /**
   * Runs a single scheduling tick:
   *   - scans for new tokens up to `upToBlock`
   *   - creates jobs for tokens without complete metadata
   *   - dispatches pending jobs to the executor
   *
   * Idempotent: safe to call multiple times for the same block range.
   *
   * @param upToBlock The inclusive upper bound of Layer 1 blocks to scan.
   */
  tick(upToBlock: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// MetadataCheckpointStore
// ---------------------------------------------------------------------------

/**
 * Durable storage for per-worker scan progress markers.
 *
 * The checkpoint store ensures that after a restart the scheduler resumes
 * from the correct Layer 1 block rather than re-scanning from genesis.
 *
 * Implementations MUST update the checkpoint atomically with job creation
 * to prevent both gaps (missed tokens) and duplicate jobs on restart.
 */
export interface MetadataCheckpointStore {
  /**
   * Returns the current checkpoint for the given worker and chain,
   * or null if this worker has never run.
   */
  getCheckpoint(workerName: string, chainId: number): Promise<MetadataCheckpoint | null>;

  /**
   * Persists a new checkpoint value (upsert semantics).
   */
  saveCheckpoint(checkpoint: MetadataCheckpoint): Promise<void>;
}

// ---------------------------------------------------------------------------
// Token Discovery Subsystem
// ---------------------------------------------------------------------------

/**
 * Protocol-specific rule that consumes Layer 1 normalized records
 * and emits token discovery candidates.
 */
export interface TokenDiscoveryRule {
  /**
   * The NormalizedRecord type this rule is capable of processing.
   * Example: 'Deposit', 'Swap', 'Withdrawal'
   */
  readonly recordType: string;

  /**
   * Evaluates the record and extracts any token candidates.
   */
  discover(record: unknown): DiscoveryCandidate[];
}

/**
 * Registry managing the collection of registered TokenDiscoveryRule instances.
 */
export interface TokenDiscoveryRegistry {
  /**
   * Registers a new protocol discovery rule.
   */
  register(rule: TokenDiscoveryRule): void;

  /**
   * Retrieves all rules registered for a given record type.
   */
  getRulesFor(recordType: string): readonly TokenDiscoveryRule[];
}

/**
 * Orchestrator and deduplicator engine that processes a batch of
 * Layer 1 normalized records and returns a clean, unique batch of discovered tokens.
 */
export interface DiscoveryEngine {
  /**
   * Processes a batch of Layer 1 normalized records and returns a deduplicated
   * batch of discovered tokens.
   */
  discoverTokens(
    records: unknown[],
    chainId: number,
    blockStart: number,
    blockEnd: number,
  ): DiscoveryBatch;
}

// ---------------------------------------------------------------------------
// Metadata Pipeline Subsystem
// ---------------------------------------------------------------------------

/**
 * Stage that performs metadata enrichment for a given token type when invoked.
 */
export interface MetadataProcessor {
  /** The enrichment type capability (e.g. "ERC20"). */
  readonly enrichmentType: string;

  /**
   * Processes a single token and returns its resolved TokenMetadata.
   *
   * @param db Shared DatabaseContext (connection pool or transaction instance).
   * @param token Uniquely identifies the token.
   */
  process(db: unknown, token: TokenIdentifier): Promise<TokenMetadata>;
}

/**
 * Registry managing the collection of registered MetadataProcessor instances.
 */
export interface MetadataProcessorRegistry {
  /** Registers a metadata processor stage. */
  register(processor: MetadataProcessor): void;

  /** Retrieves a processor for a given enrichment type, or null if unsupported. */
  getProcessor(enrichmentType: string): MetadataProcessor | null;
}

/**
 * Simple queue storage operations for L2 metadata jobs.
 */
export interface MetadataQueue {
  /** Enqueues new jobs into the queue. */
  enqueue(db: unknown, items: MetadataQueueItem[]): Promise<void>;

  /** Pulls a bounded number of pending or eligible failed jobs from the queue. */
  nextPending(db: unknown, limit: number): Promise<MetadataQueueItem[]>;

  /** Marks a job completed and typically removes or archives it. */
  markCompleted(db: unknown, chainId: number, tokenAddress: string): Promise<void>;

  /** Marks a job failed, increments attempt count, and schedules a retry run_at. */
  markFailed(
    db: unknown,
    chainId: number,
    tokenAddress: string,
    error: string,
    nextRunAt: Date,
  ): Promise<void>;

  /** Checks if a job already exists in the queue (Pending or Failed). */
  exists(db: unknown, chainId: number, tokenAddress: string): Promise<boolean>;
}

/**
 * Orchestrator pipeline stage that processes metadata enrichment inside L1 transactions.
 */
export interface MetadataPipeline {
  /**
   * Consumes a discovery batch, filters out already-known tokens (both in queue and repo),
   * and enqueues the rest as pending metadata jobs.
   */
  enqueueBatch(db: unknown, batch: DiscoveryBatch): Promise<void>;

  /**
   * Processes a bounded number of pending tasks from the queue.
   */
  processQueue(db: unknown, maxItems: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// ERC20 Metadata Provider
// ---------------------------------------------------------------------------

/**
 * Standard reasons why an EVM smart contract is unsupported for standard ERC20 metadata reads.
 */
export type UnsupportedReason =
  | "NotAContract"
  | "MissingMetadataFunctions"
  | "InvalidDecimals"
  | "ExecutionReverted";

/**
 * Discriminated result representation for an EVM blockchain metadata read.
 */
export type ERC20ProviderResult =
  | {
      readonly status: "success";
      readonly name: string | null;
      readonly symbol: string | null;
      readonly decimals: number;
    }
  | {
      readonly status: "unsupported";
      readonly reason: UnsupportedReason;
    }
  | {
      readonly status: "failure";
      readonly error: string;
      readonly isTransient: boolean;
    };

/**
 * Interface representing the capability to fetch standard ERC20 metadata from blockchain state.
 */
export interface ERC20MetadataProvider {
  /**
   * Fetches ERC20 name, symbol, and decimals in a generalized manner.
   *
   * @param token Uniquely identifies the target chain and token contract address.
   */
  fetchMetadata(token: TokenIdentifier): Promise<ERC20ProviderResult>;
}
