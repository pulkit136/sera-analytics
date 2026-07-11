import type { MetricRecorder } from "./interfaces.js";

/**
 * Thread-safe, in-memory MetricRecorder implementation.
 * Stores raw metrics in maps, useful for health checking, debugging, and benchmarks.
 */
export class InMemoryMetricRecorder implements MetricRecorder {
  public readonly counters = new Map<string, number>();
  public readonly gauges = new Map<string, number>();
  public readonly histograms = new Map<string, number[]>();

  public incrementCounter(name: string, value = 1, tags?: Record<string, string>): void {
    const key = this.getMetricKey(name, tags);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }

  public recordGauge(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.getMetricKey(name, tags);
    this.gauges.set(key, value);
  }

  public recordHistogram(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.getMetricKey(name, tags);
    let values = this.histograms.get(key);
    if (!values) {
      values = [];
      this.histograms.set(key, values);
    }
    values.push(value);
  }

  /**
   * Resets all metric maps.
   */
  public clear(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  /**
   * Helper to serialize metric name and optional tags into a unique map key.
   */
  private getMetricKey(name: string, tags?: Record<string, string>): string {
    if (!tags || Object.keys(tags).length === 0) return name;
    // Sort tags by key to ensure deterministic key mapping
    const sortedTags = Object.keys(tags)
      .sort()
      .map((k) => `${k}=${tags[k]}`)
      .join(",");
    return `${name}{${sortedTags}}`;
  }
}
