/**
 * MetricRecorder interface exposing Counter, Gauge, and Histogram metrics.
 */
export interface MetricRecorder {
  /**
   * Increments a monotonic count.
   */
  incrementCounter(name: string, value?: number, tags?: Record<string, string>): void;

  /**
   * Records an instantaneous value.
   */
  recordGauge(name: string, value: number, tags?: Record<string, string>): void;

  /**
   * Records a value in a distribution (e.g. latency in ms).
   */
  recordHistogram(name: string, value: number, tags?: Record<string, string>): void;
}

/**
 * Represents a logical unit of execution.
 */
export interface Span {
  /** Ends the span measurement. */
  end(): void;
  /** Records an error/exception inside the span. */
  recordException(err: Error): void;
}

/**
 * Tracer interface to instrument execution flows.
 */
export interface Tracer {
  /** Starts a new span. */
  startSpan(name: string, tags?: Record<string, string>): Span;
}

/**
 * Exposes a structured self-reported health outcome.
 */
export interface HealthStatus {
  readonly isHealthy: boolean;
  readonly timestamp: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Exposes a standard endpoint-free health probe.
 */
export interface HealthCheck {
  readonly name: string;
  /**
   * Executes the connectivity or synclag health check.
   */
  check(): Promise<HealthStatus>;
}

// ---------------------------------------------------------------------------
// Noop Implementations (negligible overhead when disabled)
// ---------------------------------------------------------------------------

export class NoopMetricRecorder implements MetricRecorder {
  public incrementCounter(name: string, value?: number, tags?: Record<string, string>): void {}
  public recordGauge(name: string, value: number, tags?: Record<string, string>): void {}
  public recordHistogram(name: string, value: number, tags?: Record<string, string>): void {}
}

export class NoopSpan implements Span {
  public end(): void {}
  public recordException(err: Error): void {}
}

export class NoopTracer implements Tracer {
  private static readonly span = new NoopSpan();
  public startSpan(name: string, tags?: Record<string, string>): Span {
    return NoopTracer.span;
  }
}
