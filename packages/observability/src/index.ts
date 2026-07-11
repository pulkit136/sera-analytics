// ---------------------------------------------------------------------------
// Metrics, Tracing & Health
// ---------------------------------------------------------------------------
export {
  type MetricRecorder,
  type Span,
  type Tracer,
  type HealthStatus,
  type HealthCheck,
  NoopMetricRecorder,
  NoopSpan,
  NoopTracer,
} from "./interfaces.js";

export { InMemoryMetricRecorder } from "./metrics.js";
export { SimpleSpan, SimpleTracer } from "./tracer.js";

// ---------------------------------------------------------------------------
// Structured Logging
// ---------------------------------------------------------------------------
export type { LogLevel } from "./logging/LogLevel.js";
export { LOG_LEVEL_ORDER } from "./logging/LogLevel.js";
export type { LogEntry } from "./logging/LogEntry.js";
export type { Logger, TestLogger } from "./logging/Logger.js";
export { NoopLogger, NOOP_LOGGER } from "./logging/NoopLogger.js";
export { InMemoryLogger, EPOCH_CLOCK, WALL_CLOCK } from "./logging/InMemoryLogger.js";
export type { Clock } from "./logging/InMemoryLogger.js";
