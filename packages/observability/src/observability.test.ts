import { describe, expect, it, vi } from "vitest";
import { InMemoryMetricRecorder, NoopMetricRecorder, NoopTracer, SimpleTracer } from "./index.js";
import type { HealthCheck, HealthStatus } from "./interfaces.js";

// Mock HealthCheck
class MockHealthCheck implements HealthCheck {
  public readonly name = "mock_health";
  public isHealthy = true;

  public async check(): Promise<HealthStatus> {
    return {
      isHealthy: this.isHealthy,
      timestamp: new Date().toISOString(),
      details: { ok: this.isHealthy },
    };
  }
}

describe("Observability Subsystem Unit Tests", () => {
  it("should successfully record counters, gauges, and histograms in InMemoryMetricRecorder", () => {
    const recorder = new InMemoryMetricRecorder();

    // 1. Counters
    recorder.incrementCounter("test_counter", 1);
    recorder.incrementCounter("test_counter", 5);
    expect(recorder.counters.get("test_counter")).toBe(6);

    // Counters with tags
    recorder.incrementCounter("test_counter", 2, { service: "indexer" });
    expect(recorder.counters.get("test_counter{service=indexer}")).toBe(2);

    // 2. Gauges
    recorder.recordGauge("test_gauge", 42);
    expect(recorder.gauges.get("test_gauge")).toBe(42);

    // 3. Histograms
    recorder.recordHistogram("test_hist", 10.5);
    recorder.recordHistogram("test_hist", 20.0);
    const histValues = recorder.histograms.get("test_hist");
    expect(histValues).toEqual([10.5, 20.0]);

    // 4. Clear metrics
    recorder.clear();
    expect(recorder.counters.size).toBe(0);
    expect(recorder.gauges.size).toBe(0);
    expect(recorder.histograms.size).toBe(0);
  });

  it("should measure and record timings in SimpleTracer spans", async () => {
    const recorder = new InMemoryMetricRecorder();
    const tracer = new SimpleTracer(recorder);

    const span = tracer.startSpan("process_tx", { method: "swap" });
    // Simulate some delay
    await new Promise((resolve) => setTimeout(resolve, 10));
    span.end();

    const histKey = "process_tx_duration_ms{method=swap}";
    const timings = recorder.histograms.get(histKey);
    expect(timings).toBeDefined();
    expect(timings![0]).toBeGreaterThanOrEqual(9); // should be around 10ms
  });

  it("should execute HealthCheck and report healthy status", async () => {
    const probe = new MockHealthCheck();
    let status = await probe.check();
    expect(status.isHealthy).toBe(true);
    expect(status.details?.ok).toBe(true);

    probe.isHealthy = false;
    status = await probe.check();
    expect(status.isHealthy).toBe(false);
    expect(status.details?.ok).toBe(false);
  });

  it("should successfully run no-op metric recorders and tracers without throwing errors", () => {
    const recorder = new NoopMetricRecorder();
    const tracer = new NoopTracer();

    expect(() => {
      recorder.incrementCounter("test", 1);
      recorder.recordGauge("test", 100);
      recorder.recordHistogram("test", 50);

      const span = tracer.startSpan("noop");
      span.recordException(new Error("test"));
      span.end();
    }).not.toThrow();
  });
});
