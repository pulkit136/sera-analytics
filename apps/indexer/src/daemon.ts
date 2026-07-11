import { type Logger, NOOP_LOGGER } from "@sera/observability";
import type { IndexingPipeline, IndexingPipelineConfig, IndexingResult } from "./pipeline.js";

// ---------------------------------------------------------------------------
// State machine types
// ---------------------------------------------------------------------------

/**
 * All possible lifecycle/health states of the ContinuousIndexer.
 *
 * `Error` is a health indicator — the daemon continues retrying in the
 * `Error → BackingOff → Recovering` loop and never self-terminates.
 */
export type DaemonState =
  | "Starting"
  | "Syncing"
  | "Idle"
  | "BackingOff"
  | "Recovering"
  | "Stopping"
  | "Stopped"
  | "Error";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the ContinuousIndexer daemon.
 */
export interface ContinuousIndexerConfig {
  /** Fully-constructed IndexingPipeline instance. */
  pipeline: IndexingPipeline;
  /** Configuration forwarded verbatim to every pipeline.execute() call. */
  pipelineConfig: IndexingPipelineConfig;
  /**
   * Milliseconds to sleep between polls once the indexer is caught up
   * with the chain head.
   */
  pollingIntervalMs: number;
  /**
   * Starting backoff delay (ms) used after the first consecutive failure.
   * Subsequent failures double the delay (capped by maxBackoffMs).
   */
  initialBackoffMs: number;
  /**
   * Upper bound (ms) for exponential backoff delays.
   */
  maxBackoffMs: number;
  /**
   * Fraction of the computed backoff to apply as random jitter.
   * The jitter is symmetric: delay × (1 + jitterFactor × rand(-1,1)).
   * Defaults to 0.15 (±15%), giving approximately 10–20% spread.
   */
  jitterFactor?: number;
  /**
   * Maximum milliseconds to wait for the current batch to finish after
   * stop() is called before the shutdown promise force-resolves.
   * Defaults to 10 000 ms.
   */
  shutdownTimeoutMs?: number;
  /**
   * Structured logger. Defaults to the shared ConsoleLogger.
   */
  logger?: Logger;
}

// ---------------------------------------------------------------------------
// ContinuousIndexer
// ---------------------------------------------------------------------------

/**
 * A long-running daemon that drives the IndexingPipeline continuously.
 *
 * Execution model:
 *   • While behind chain head: execute batches in a tight loop (no sleep).
 *   • When caught up: enter Idle state and sleep `pollingIntervalMs`.
 *   • On any error: enter Error health state, sleep a jittered exponential
 *     backoff delay, then retry indefinitely (Recovering).
 *   • On stop() or SIGINT/SIGTERM: finish the current batch, then exit.
 *
 * The Error state reflects current health and is NOT terminal. The daemon
 * continues retrying until the first successful batch (state → Syncing) or
 * until stop() is called (state → Stopping → Stopped).
 */
export class ContinuousIndexer {
  private _state: DaemonState = "Starting";
  private _consecutiveFailures = 0;
  private _shutdownRequested = false;

  // Resolves when the daemon loop fully exits (state = Stopped).
  private _stoppedResolve: (() => void) | null = null;
  private readonly _stoppedPromise: Promise<void>;

  // AbortController used to interrupt Idle / BackingOff sleeps on shutdown.
  private _sleepAbort: AbortController | null = null;

  private readonly _logger: Logger;
  private readonly _jitterFactor: number;
  private readonly _shutdownTimeoutMs: number;

  // POSIX signal handler references (kept so we can remove them on Stopped).
  private readonly _sigintHandler: () => void;
  private readonly _sigtermHandler: () => void;

  constructor(private readonly config: ContinuousIndexerConfig) {
    this._logger = config.logger ?? NOOP_LOGGER;
    this._jitterFactor = config.jitterFactor ?? 0.15;
    this._shutdownTimeoutMs = config.shutdownTimeoutMs ?? 10_000;

    this._stoppedPromise = new Promise<void>((resolve) => {
      this._stoppedResolve = resolve;
    });

    this._sigintHandler = () => {
      this._logger.info("ContinuousIndexer received SIGINT — initiating graceful shutdown.");
      void this.stop();
    };
    this._sigtermHandler = () => {
      this._logger.info("ContinuousIndexer received SIGTERM — initiating graceful shutdown.");
      void this.stop();
    };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Current daemon state. */
  get state(): DaemonState {
    return this._state;
  }

  /** Number of consecutive pipeline failures since the last success. */
  get consecutiveFailures(): number {
    return this._consecutiveFailures;
  }

  /**
   * Starts the continuous indexing loop and registers SIGINT/SIGTERM handlers.
   * Safe to call only once; subsequent calls are no-ops.
   */
  start(): void {
    if (this._state !== "Starting") {
      this._logger.warn("ContinuousIndexer.start() called in non-Starting state — ignoring.", {
        state: this._state,
      });
      return;
    }

    this._logger.info("ContinuousIndexer starting.");
    process.on("SIGINT", this._sigintHandler);
    process.on("SIGTERM", this._sigtermHandler);

    // Run the loop in the background — we intentionally do not await it here.
    void this._runLoop();
  }

  /**
   * Signals the daemon to shut down gracefully.
   *
   * - The current indexing batch (if any) is allowed to complete.
   * - Any in-progress Idle or BackingOff sleep is interrupted immediately.
   * - Returns a Promise that resolves when the daemon has fully stopped.
   * - A `shutdownTimeoutMs` force-resolve fallback prevents callers from
   *   hanging if the current batch takes too long.
   */
  async stop(): Promise<void> {
    if (this._shutdownRequested) {
      // Already stopping — just await the same settled promise.
      return this._stoppedPromise;
    }

    this._shutdownRequested = true;
    this._logger.info("ContinuousIndexer shutdown requested.", { state: this._state });

    // Wake any in-progress sleep immediately.
    this._sleepAbort?.abort();

    // Force-resolve after the shutdown timeout so callers are never stuck.
    const timeoutHandle = setTimeout(() => {
      this._logger.warn("ContinuousIndexer shutdown timeout reached — forcing Stopped.", {
        shutdownTimeoutMs: this._shutdownTimeoutMs,
      });
      this._transition("Stopped");
      this._stoppedResolve?.();
    }, this._shutdownTimeoutMs);

    await this._stoppedPromise;
    clearTimeout(timeoutHandle);
  }

  // ---------------------------------------------------------------------------
  // Core loop
  // ---------------------------------------------------------------------------

  private async _runLoop(): Promise<void> {
    while (!this._shutdownRequested) {
      try {
        // Decide which state label to use for this iteration.
        if (this._consecutiveFailures > 0) {
          this._transition("Recovering");
        } else {
          this._transition("Syncing");
        }

        const result: IndexingResult = await this.config.pipeline.execute(
          this.config.pipelineConfig,
        );

        // ── Success path ──────────────────────────────────────────────
        if (this._consecutiveFailures > 0) {
          this._logger.info("ContinuousIndexer recovered after consecutive failures.", {
            consecutiveFailures: this._consecutiveFailures,
          });
        }
        this._consecutiveFailures = 0;

        this._logger.debug("ContinuousIndexer batch complete.", {
          fromBlock: result.fromBlock,
          toBlock: result.toBlock,
          caughtUp: result.caughtUp,
          normalizedRecords: result.normalizedRecords,
          durationMs: result.durationMs,
        });

        if (result.caughtUp) {
          // Sleep until the next polling interval, interruptible by stop().
          this._transition("Idle");
          await this._sleep(this.config.pollingIntervalMs);
        }
        // If not caughtUp, loop immediately (no sleep).
      } catch (error) {
        // ── Error path ────────────────────────────────────────────────
        this._consecutiveFailures++;
        this._transition("Error");

        const backoffMs = this._computeBackoff(this._consecutiveFailures);

        this._logger.error("ContinuousIndexer batch failed — entering backoff.", {
          consecutiveFailures: this._consecutiveFailures,
          backoffMs,
          error: error instanceof Error ? error.message : String(error),
        });

        this._transition("BackingOff");
        await this._sleep(backoffMs);
        // After sleep, the loop re-enters at the top and sets Recovering.
      }
    }

    // ── Shutdown ──────────────────────────────────────────────────────
    this._transition("Stopping");
    this._logger.info("ContinuousIndexer loop exited cleanly.");

    // Remove signal handlers so repeated signals don't call stop() again.
    process.off("SIGINT", this._sigintHandler);
    process.off("SIGTERM", this._sigtermHandler);

    this._transition("Stopped");
    this._stoppedResolve?.();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Computes the jittered exponential backoff delay for the nth failure.
   *
   *   base  = min(initialBackoffMs × 2^(n−1), maxBackoffMs)
   *   delay = base × (1 + jitterFactor × rand(−1, 1))
   *
   * Jitter is symmetric: the result can be shorter or longer than `base`
   * by up to `jitterFactor × 100`% (default ±15%).
   */
  public _computeBackoff(failureCount: number): number {
    const exponent = Math.min(failureCount - 1, 30); // guard against huge exponents
    const base = Math.min(this.config.initialBackoffMs * 2 ** exponent, this.config.maxBackoffMs);
    const jitter = this._jitterFactor * (2 * Math.random() - 1);
    return Math.max(0, Math.round(base * (1 + jitter)));
  }

  /**
   * Sleeps for `ms` milliseconds, but resolves immediately if stop() is
   * called (via AbortController signal).
   */
  private async _sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const abort = new AbortController();
      this._sleepAbort = abort;

      const timer = setTimeout(() => {
        this._sleepAbort = null;
        resolve();
      }, ms);

      abort.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        this._sleepAbort = null;
        resolve();
      });
    });
  }

  /**
   * Transitions to a new state and emits a structured log entry.
   */
  private _transition(next: DaemonState): void {
    if (this._state === next) return;
    const prev = this._state;
    this._state = next;
    this._logger.debug("ContinuousIndexer state transition.", { from: prev, to: next });
  }
}
