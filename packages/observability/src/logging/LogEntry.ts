import type { LogLevel } from "./LogLevel.js";

/**
 * An immutable, structured log record.
 *
 * Contains only the minimum fields necessary for operational visibility.
 * All contextual data lives in `fields`, not in the message string.
 */
export interface LogEntry {
  /** ISO 8601 timestamp at which the entry was created. */
  readonly timestamp: string;
  /** Severity level of the entry. */
  readonly level: LogLevel;
  /** Human-readable description of the event. Must be a static string — no interpolation. */
  readonly message: string;
  /** Arbitrary structured key-value context attached to this entry. */
  readonly fields: Readonly<Record<string, unknown>>;
}
