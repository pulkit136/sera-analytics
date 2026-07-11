/**
 * Canonical log levels in ascending severity order.
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/**
 * Numeric ordering for log levels used for filtering comparisons.
 */
export const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};
