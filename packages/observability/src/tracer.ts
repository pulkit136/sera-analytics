import type { MetricRecorder, Span, Tracer } from "./interfaces.js";

/**
 * Simple Span measuring high-resolution performance timings.
 */
export class SimpleSpan implements Span {
  private readonly startTime = performance.now();

  constructor(
    private readonly name: string,
    private readonly tags?: Record<string, string>,
    private readonly recorder?: MetricRecorder,
  ) {}

  public end(): void {
    const durationMs = performance.now() - this.startTime;
    if (this.recorder) {
      // Record latency duration directly into the histogram metrics
      this.recorder.recordHistogram(`${this.name}_duration_ms`, durationMs, this.tags);
    }
  }

  public recordException(err: Error): void {
    if (this.recorder) {
      this.recorder.incrementCounter(`${this.name}_exceptions_total`, 1, {
        error: err.name || "Error",
        ...this.tags,
      });
    }
  }
}

/**
 * Simple Tracer orchestrating span instrumentation.
 */
export class SimpleTracer implements Tracer {
  constructor(private readonly recorder?: MetricRecorder) {}

  public startSpan(name: string, tags?: Record<string, string>): Span {
    return new SimpleSpan(name, tags, this.recorder);
  }
}
