import { SeraError } from "@sera/shared";

/**
 * Custom error thrown when RPC interactions with the blockchain layer fail.
 */
export class RpcError extends SeraError {
  constructor(message: string, cause?: unknown, context?: Record<string, unknown>) {
    super(message, "RPC_ERROR", { ...context, cause });
  }
}

/**
 * Custom error thrown when the ABI decoder encounters unexpected internal failures.
 */
export class DecoderError extends SeraError {
  constructor(message: string, cause?: unknown, context?: Record<string, unknown>) {
    super(message, "DECODER_ERROR", { ...context, cause });
  }
}

/**
 * Custom error thrown when the event normalizer encounters unexpected internal failures.
 */
export class NormalizerError extends SeraError {
  constructor(message: string, cause?: unknown, context?: Record<string, unknown>) {
    super(message, "NORMALIZER_ERROR", { ...context, cause });
  }
}
