import type { LogEntry } from "./LogEntry.js";

/**
 * Minimal structured logger interface.
 *
 * All methods accept a static message string and an optional
 * structured fields object. No string interpolation, no printf formatting.
 *
 * Usage:
 *   logger.info("Block indexed", { blockNumber, transactionCount, durationMs })
 *   logger.error("Pipeline failed", { error: err.message, chainId })
 *
 * Core packages depend only on this interface.
 * No package should import a concrete implementation.
 */
export interface Logger {
  /** Fine-grained diagnostic events. Disabled in production by default. */
  trace(message: string, fields?: Record<string, unknown>): void;

  /** Detailed diagnostic information useful during development. */
  debug(message: string, fields?: Record<string, unknown>): void;

  /** Normal operational lifecycle events. */
  info(message: string, fields?: Record<string, unknown>): void;

  /** Events that are unexpected but recoverable. */
  warn(message: string, fields?: Record<string, unknown>): void;

  /** Failures requiring immediate attention. */
  error(message: string, fields?: Record<string, unknown>): void;
}

/**
 * Optional interface for loggers that expose recorded entries (e.g. TestLogger).
 * Intended exclusively for use in tests.
 */
export interface TestLogger extends Logger {
  readonly entries: readonly LogEntry[];
  clear(): void;
}
