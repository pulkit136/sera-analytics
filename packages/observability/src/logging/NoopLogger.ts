import type { Logger } from "./Logger.js";

/**
 * Production-safe Logger implementation that performs no work.
 *
 * This is the default dependency injected when logging is not required.
 * It has zero overhead: every method is a no-op with no allocations
 * beyond the call itself.
 */
export class NoopLogger implements Logger {
  public trace(_message: string, _fields?: Record<string, unknown>): void {}
  public debug(_message: string, _fields?: Record<string, unknown>): void {}
  public info(_message: string, _fields?: Record<string, unknown>): void {}
  public warn(_message: string, _fields?: Record<string, unknown>): void {}
  public error(_message: string, _fields?: Record<string, unknown>): void {}
}

/** Shared singleton instance safe to use as a default dependency. */
export const NOOP_LOGGER: Logger = new NoopLogger();
