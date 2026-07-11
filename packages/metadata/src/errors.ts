import { SeraError } from "@sera/shared";

/**
 * Base class for all errors originating from the metadata enrichment layer.
 *
 * Extending SeraError ensures every metadata error carries a machine-readable
 * `code` and an optional structured `context` bag, consistent with the rest
 * of the sera-data error hierarchy.
 */
export class MetadataError extends SeraError {
  constructor(message: string, cause?: unknown, context?: Record<string, unknown>) {
    super(message, "METADATA_ERROR", { ...context, cause });
  }
}

/**
 * Raised when an external metadata provider returns an unsuccessful response
 * or cannot be reached.  Includes the provider name and, where available, the
 * HTTP status code or provider-specific error payload.
 */
export class ProviderError extends SeraError {
  constructor(
    message: string,
    public readonly providerName: string,
    cause?: unknown,
    context?: Record<string, unknown>,
  ) {
    super(message, "PROVIDER_ERROR", { providerName, ...context, cause });
  }
}

/**
 * Raised when a metadata job exhausts all configured retry attempts without
 * producing a valid result.  Carries the number of attempts that were made so
 * callers can decide whether to re-queue or dead-letter the job.
 */
export class RetryExhaustedError extends SeraError {
  constructor(
    message: string,
    public readonly attempts: number,
    cause?: unknown,
    context?: Record<string, unknown>,
  ) {
    super(message, "RETRY_EXHAUSTED_ERROR", { attempts, ...context, cause });
  }
}

/**
 * Raised when a provider response can be parsed but does not satisfy the
 * invariants required for deterministic storage (e.g. a token name that is
 * an empty string, or a decimals value outside the ERC-20 legal range).
 */
export class InvalidMetadataError extends SeraError {
  constructor(message: string, cause?: unknown, context?: Record<string, unknown>) {
    super(message, "INVALID_METADATA_ERROR", { ...context, cause });
  }
}
