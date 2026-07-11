/**
 * @sera/metadata — Public API
 *
 * This barrel exports only the stable, public-facing surface of the metadata
 * package.  Internal implementation details are never re-exported from here.
 *
 * Dependency contract (enforced by package.json, not by TypeScript):
 *   ✅ may import from @sera/shared
 *   ❌ must NOT depend on @sera/database (no Kysely, no SQL)
 *   ❌ must NOT depend on viem or any RPC client
 *   ❌ must NOT depend on apps/* or analytics
 */

// Domain types — immutable value objects and discriminated unions
export type {
  TokenIdentifier,
  TokenMetadata,
  MetadataJob,
  MetadataJobStatus,
  MetadataResult,
  MetadataSource,
  EnrichmentReason,
  MetadataCheckpoint,
  DiscoveryReason,
  DiscoverySource,
  DiscoveryCandidate,
  DiscoveredToken,
  DiscoveryBatch,
  MetadataQueueItemStatus,
  MetadataQueueItem,
} from "./types.js";

// Interfaces — narrowly scoped contracts implemented by future milestones
export type {
  MetadataWorker,
  MetadataRepository,
  MetadataProvider,
  MetadataScheduler,
  RetryPolicy,
  BatchExecutor,
  MetadataCache,
  MetadataCheckpointStore,
  TokenDiscoveryRule,
  TokenDiscoveryRegistry,
  DiscoveryEngine,
  MetadataProcessor,
  MetadataProcessorRegistry,
  MetadataQueue,
  MetadataPipeline,
  UnsupportedReason,
  ERC20ProviderResult,
  ERC20MetadataProvider,
} from "./interfaces.js";

// Error hierarchy — typed failures for all metadata error conditions
export {
  MetadataError,
  ProviderError,
  RetryExhaustedError,
  InvalidMetadataError,
} from "./errors.js";

// Token Discovery Subsystem Implementations
export { DefaultTokenDiscoveryRegistry } from "./discoveryRegistry.js";
export {
  DepositDiscoveryRule,
  WithdrawalDiscoveryRule,
  SwapDiscoveryRule,
} from "./discoveryRules.js";
export { DefaultDiscoveryEngine } from "./discoveryEngine.js";

// Metadata Pipeline Implementations
export { DefaultMetadataProcessorRegistry } from "./processorRegistry.js";
export { DefaultMetadataPipeline } from "./metadataPipeline.js";
export { ERC20MetadataProcessor } from "./erc20Processor.js";
export { MetadataPipelineHealthCheck } from "./health.js";
