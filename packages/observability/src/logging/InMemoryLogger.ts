import type { LogEntry } from "./LogEntry.js";
import type { LogLevel } from "./LogLevel.js";
import { LOG_LEVEL_ORDER } from "./LogLevel.js";
import type { Logger, TestLogger } from "./Logger.js";

/**
 * A clock function that returns the current ISO 8601 timestamp.
 * Injecting a Clock makes the logger deterministic and
 * suitable for controlled test scenarios.
 */
export type Clock = () => string;

/**
 * Default wall-clock implementation. Used in production adapters.
 */
export const WALL_CLOCK: Clock = () => new Date().toISOString();

/**
 * Deterministic fixed-time clock pinned to epoch 0.
 * Use in unit tests that must not depend on wall-clock time.
 */
export const EPOCH_CLOCK: Clock = () => new Date(0).toISOString();

/**
 * In-memory Logger implementation intended solely for tests.
 *
 * Characteristics:
 * - Stores all entries in insertion order (deterministic).
 * - No timers, no async behavior, no side-effects beyond the entries array.
 * - Supports an optional minimum log level threshold.
 * - Timestamps are produced by an injected Clock — use EPOCH_CLOCK for
 *   stable test assertions, WALL_CLOCK for live introspection.
 * - Recorded entries are frozen (immutable) after capture.
 *
 * Usage:
 *   const logger = new InMemoryLogger();
 *   sut.doWork(logger);
 *   expect(logger.entries).toHaveLength(1);
 *   expect(logger.entries[0].level).toBe("info");
 */
export class InMemoryLogger implements TestLogger {
  private readonly _entries: LogEntry[] = [];
  private readonly _minLevel: LogLevel;
  private readonly _clock: Clock;

  constructor(minLevel: LogLevel = "trace", clock: Clock = EPOCH_CLOCK) {
    this._minLevel = minLevel;
    this._clock = clock;
  }

  /** All log entries recorded since construction (or last clear()), in insertion order. */
  public get entries(): readonly LogEntry[] {
    return this._entries;
  }

  /** Removes all recorded entries. */
  public clear(): void {
    this._entries.length = 0;
  }

  public trace(message: string, fields?: Record<string, unknown>): void {
    this.record("trace", message, fields);
  }

  public debug(message: string, fields?: Record<string, unknown>): void {
    this.record("debug", message, fields);
  }

  public info(message: string, fields?: Record<string, unknown>): void {
    this.record("info", message, fields);
  }

  public warn(message: string, fields?: Record<string, unknown>): void {
    this.record("warn", message, fields);
  }

  public error(message: string, fields?: Record<string, unknown>): void {
    this.record("error", message, fields);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private record(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[this._minLevel]) {
      return;
    }

    const entry: LogEntry = Object.freeze({
      timestamp: this._clock(),
      level,
      message,
      fields: Object.freeze({ ...(fields ?? {}) }),
    });

    this._entries.push(entry);
  }
}
