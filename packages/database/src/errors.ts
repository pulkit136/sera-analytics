import { SeraError } from "@sera/shared";

/**
 * Custom error thrown when persistence operations in the database layer fail.
 */
export class PersistenceError extends SeraError {
  constructor(message: string, cause?: unknown, context?: Record<string, unknown>) {
    super(message, "PERSISTENCE_ERROR", { ...context, cause });
  }
}

/**
 * Custom error thrown when checkpoint store operations fail.
 */
export class CheckpointError extends SeraError {
  constructor(message: string, cause?: unknown, context?: Record<string, unknown>) {
    super(message, "CHECKPOINT_ERROR", { ...context, cause });
  }
}

/**
 * Custom error thrown when chain reorganization detection or recovery fails.
 */
export class ReorgError extends SeraError {
  constructor(message: string, cause?: unknown, context?: Record<string, unknown>) {
    super(message, "REORG_ERROR", { ...context, cause });
  }
}
