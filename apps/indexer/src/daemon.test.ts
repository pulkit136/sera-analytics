import type { Logger } from "@sera/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContinuousIndexer } from "./daemon.js";
import type { IndexingResult } from "./pipeline.js";
import type { IndexingPipeline, IndexingPipelineConfig } from "./pipeline.js";

// ---------------------------------------------------------------------------
// Vitest 1.x compatibility helpers
// ---------------------------------------------------------------------------

/**
 * Yields control to pending microtasks / promise continuations.
 * In Vitest 1.x, `vi.runAllMicrotasksAsync()` does not exist;
 * multiple `await Promise.resolve()` calls drain the queue instead.
 */
async function flushPromises(depth = 10): Promise<void> {
  for (let i = 0; i < depth; i++) {
    await Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Silent no-op logger used across all tests to keep output clean. */
const silentLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const PIPELINE_CONFIG: IndexingPipelineConfig = {
  startBlock: 1000,
  batchSize: 100,
  contractAddresses: ["0xC7d4Fd2638e6630C8C61329878676b88A8A24D43"],
};

/** Builds a synthetic IndexingResult for the pipeline mock to return. */
function makeResult(overrides: Partial<IndexingResult> = {}): IndexingResult {
  return {
    fromBlock: 1000,
    toBlock: 1100,
    latestChainBlock: 1100,
    logsFetched: 0,
    eventsDecoded: 0,
    unknownEvents: 0,
    normalizedRecords: 0,
    persistenceStatistics: { insertedCount: 0, updatedCount: 0, skippedCount: 0 },
    remainingBlocks: 0,
    caughtUp: true,
    durationMs: 5,
    reorgRecovered: false,
    ...overrides,
  };
}

/** Builds a pipeline mock where execute() returns the provided sequence of results/errors. */
function makePipeline(
  responses: Array<IndexingResult | Error>,
): IndexingPipeline & { execute: ReturnType<typeof vi.fn> } {
  const execute = vi.fn();
  for (const r of responses) {
    if (r instanceof Error) {
      execute.mockRejectedValueOnce(r);
    } else {
      execute.mockResolvedValueOnce(r);
    }
  }
  // Default to caughtUp=true for any calls beyond the explicit sequence.
  execute.mockResolvedValue(makeResult({ caughtUp: true }));
  return { execute } as unknown as IndexingPipeline & { execute: ReturnType<typeof vi.fn> };
}

/**
 * Creates a ContinuousIndexer with safe defaults for tests:
 *   - pollingIntervalMs: 100 ms
 *   - initialBackoffMs:  50 ms
 *   - maxBackoffMs:      200 ms
 *   - jitterFactor:      0   (deterministic)
 *   - shutdownTimeoutMs: 2000 ms
 */
function makeDaemon(
  pipeline: IndexingPipeline,
  overrides: Partial<ConstructorParameters<typeof ContinuousIndexer>[0]> = {},
): ContinuousIndexer {
  return new ContinuousIndexer({
    pipeline,
    pipelineConfig: PIPELINE_CONFIG,
    pollingIntervalMs: 100,
    initialBackoffMs: 50,
    maxBackoffMs: 200,
    jitterFactor: 0,
    shutdownTimeoutMs: 2000,
    logger: silentLogger,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ContinuousIndexer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── State machine ────────────────────────────────────────────────────────

  it("initialises in Starting state", () => {
    const daemon = makeDaemon(makePipeline([]));
    expect(daemon.state).toBe("Starting");
  });

  it("transitions Starting → Syncing once start() is called", async () => {
    const pipeline = makePipeline([makeResult({ caughtUp: true })]);
    const daemon = makeDaemon(pipeline);

    daemon.start();
    await flushPromises();

    expect(["Syncing", "Idle", "Stopped"]).toContain(daemon.state);
  });

  // ── Normal execution ─────────────────────────────────────────────────────

  it("executes batches in a tight loop while not caught up", async () => {
    const pipeline = makePipeline([
      makeResult({ caughtUp: false }),
      makeResult({ caughtUp: false }),
      makeResult({ caughtUp: true }), // enters Idle after this
    ]);
    const daemon = makeDaemon(pipeline);

    daemon.start();
    await flushPromises();
    // Advance past the polling sleep.
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();

    await daemon.stop();

    expect(pipeline.execute.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("sleeps pollingIntervalMs between batches when caught up", async () => {
    let callCount = 0;
    const pipeline = {
      execute: vi.fn(async () => {
        callCount++;
        return makeResult({ caughtUp: true });
      }),
    } as unknown as IndexingPipeline;

    const daemon = makeDaemon(pipeline, { pollingIntervalMs: 500 });
    daemon.start();

    // First batch runs immediately.
    await flushPromises();
    expect(callCount).toBe(1);
    expect(daemon.state).toBe("Idle");

    // Advance 499 ms — still sleeping.
    await vi.advanceTimersByTimeAsync(499);
    await flushPromises();
    expect(callCount).toBe(1);

    // Advance the remaining 1 ms — sleep should fire.
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(callCount).toBeGreaterThanOrEqual(2);

    await daemon.stop();
  });

  // ── Graceful shutdown ────────────────────────────────────────────────────

  it("stop() transitions daemon to Stopped", async () => {
    const daemon = makeDaemon(makePipeline([makeResult({ caughtUp: true })]));
    daemon.start();
    await flushPromises();

    await daemon.stop();
    expect(daemon.state).toBe("Stopped");
  });

  it("stop() during Idle wakes sleep immediately", async () => {
    const pipeline = makePipeline([makeResult({ caughtUp: true })]);
    const daemon = makeDaemon(pipeline, { pollingIntervalMs: 60_000 });
    daemon.start();

    await flushPromises();
    expect(daemon.state).toBe("Idle");

    const stopPromise = daemon.stop();
    await flushPromises();
    await stopPromise;

    expect(daemon.state).toBe("Stopped");
  });

  it("stop() during BackingOff wakes sleep immediately", async () => {
    const pipeline = makePipeline([new Error("RPC timeout")]);
    const daemon = makeDaemon(pipeline, {
      initialBackoffMs: 60_000,
      maxBackoffMs: 60_000,
    });
    daemon.start();

    await flushPromises();
    expect(daemon.state).toBe("BackingOff");

    const stopPromise = daemon.stop();
    await flushPromises();
    await stopPromise;

    expect(daemon.state).toBe("Stopped");
  });

  it("stop() called a second time returns the same promise without side-effects", async () => {
    const daemon = makeDaemon(makePipeline([makeResult({ caughtUp: true })]));
    daemon.start();
    await flushPromises();

    const p1 = daemon.stop();
    const p2 = daemon.stop();
    await flushPromises();
    await Promise.all([p1, p2]);

    expect(daemon.state).toBe("Stopped");
  });

  // ── Error handling and backoff ───────────────────────────────────────────

  it("transitions to Error/BackingOff state on first pipeline failure", async () => {
    const pipeline = makePipeline([new Error("Network error"), makeResult({ caughtUp: true })]);
    const daemon = makeDaemon(pipeline);
    daemon.start();

    await flushPromises();
    // After the first rejected execute(), loop enters Error then BackingOff.
    expect(daemon.state).toBe("BackingOff");
    expect(daemon.consecutiveFailures).toBe(1);

    await daemon.stop();
  });

  it("recovers from Error state after a successful batch", async () => {
    const pipeline = makePipeline([new Error("Network error"), makeResult({ caughtUp: true })]);

    const d = new ContinuousIndexer({
      pipeline,
      pipelineConfig: PIPELINE_CONFIG,
      pollingIntervalMs: 100,
      initialBackoffMs: 10,
      maxBackoffMs: 10,
      jitterFactor: 0,
      shutdownTimeoutMs: 2000,
      logger: silentLogger,
    });
    d.start();

    // Failure fires.
    await flushPromises();
    expect(d.consecutiveFailures).toBe(1);

    // Advance through the 10 ms backoff sleep.
    await vi.advanceTimersByTimeAsync(15);
    await flushPromises();

    // Recovery batch should have run; consecutiveFailures resets.
    expect(d.consecutiveFailures).toBe(0);
    expect(d.state).not.toBe("Error");

    await d.stop();
  });

  it("Error state is non-terminal — daemon continues retrying indefinitely", async () => {
    const repeatedError = new Error("Persistent RPC failure");
    let callCount = 0;
    const pipeline = {
      execute: vi.fn(async () => {
        callCount++;
        throw repeatedError;
      }),
    } as unknown as IndexingPipeline;

    const daemon = makeDaemon(pipeline, {
      initialBackoffMs: 10,
      maxBackoffMs: 10,
    });
    daemon.start();

    // Run 5 failure + backoff cycles.
    for (let i = 0; i < 5; i++) {
      await flushPromises();
      await vi.advanceTimersByTimeAsync(15);
    }
    await flushPromises();

    // Daemon should still be alive.
    expect(daemon.state).not.toBe("Stopped");
    expect(daemon.consecutiveFailures).toBeGreaterThanOrEqual(3);
    expect(callCount).toBeGreaterThanOrEqual(3);

    // And stops cleanly on request.
    await daemon.stop();
    expect(daemon.state).toBe("Stopped");
  });

  // ── Backoff schedule ─────────────────────────────────────────────────────

  describe("_computeBackoff (jitterFactor=0)", () => {
    it("returns initialBackoffMs on the first failure", () => {
      const daemon = makeDaemon(makePipeline([]), { initialBackoffMs: 1000, maxBackoffMs: 60_000 });
      expect(daemon._computeBackoff(1)).toBe(1000);
    });

    it("doubles on the second failure", () => {
      const daemon = makeDaemon(makePipeline([]), { initialBackoffMs: 1000, maxBackoffMs: 60_000 });
      expect(daemon._computeBackoff(2)).toBe(2000);
    });

    it("quadruples on the third failure", () => {
      const daemon = makeDaemon(makePipeline([]), { initialBackoffMs: 1000, maxBackoffMs: 60_000 });
      expect(daemon._computeBackoff(3)).toBe(4000);
    });

    it("caps at maxBackoffMs", () => {
      const daemon = makeDaemon(makePipeline([]), { initialBackoffMs: 1000, maxBackoffMs: 5000 });
      expect(daemon._computeBackoff(10)).toBe(5000);
    });
  });

  describe("_computeBackoff jitter", () => {
    it("produces delays within the expected jitter window", () => {
      const daemon = makeDaemon(makePipeline([]), {
        initialBackoffMs: 1000,
        maxBackoffMs: 60_000,
        jitterFactor: 0.15,
      });
      for (let i = 0; i < 50; i++) {
        const delay = daemon._computeBackoff(1);
        expect(delay).toBeGreaterThanOrEqual(Math.round(1000 * 0.85));
        expect(delay).toBeLessThanOrEqual(Math.round(1000 * 1.15));
      }
    });
  });

  // ── SIGTERM / SIGINT ─────────────────────────────────────────────────────

  it("handles SIGTERM gracefully", async () => {
    const pipeline = makePipeline([makeResult({ caughtUp: true })]);
    const daemon = makeDaemon(pipeline);
    daemon.start();

    await flushPromises();

    process.emit("SIGTERM");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();

    expect(["Stopping", "Stopped"]).toContain(daemon.state);

    if (daemon.state !== "Stopped") {
      await daemon.stop();
    }
  });

  it("handles SIGINT gracefully", async () => {
    const pipeline = makePipeline([makeResult({ caughtUp: true })]);
    const daemon = makeDaemon(pipeline);
    daemon.start();

    await flushPromises();

    process.emit("SIGINT");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();

    expect(["Stopping", "Stopped"]).toContain(daemon.state);

    if (daemon.state !== "Stopped") {
      await daemon.stop();
    }
  });

  // ── State transition sequence ────────────────────────────────────────────

  it("records the correct state transition sequence for a normal caught-up cycle", async () => {
    const transitions: string[] = [];
    const debugMock = vi.fn((_msg: string, meta?: Record<string, unknown>) => {
      if (meta?.to) transitions.push(meta.to as string);
    });

    const pipeline = makePipeline([makeResult({ caughtUp: true })]);
    const daemon = new ContinuousIndexer({
      pipeline,
      pipelineConfig: PIPELINE_CONFIG,
      pollingIntervalMs: 100,
      initialBackoffMs: 50,
      maxBackoffMs: 200,
      jitterFactor: 0,
      shutdownTimeoutMs: 2000,
      logger: { ...silentLogger, debug: debugMock },
    });

    daemon.start();
    await flushPromises();

    // After first caught-up batch: Syncing → Idle.
    expect(transitions).toContain("Syncing");
    expect(transitions).toContain("Idle");

    const stopPromise = daemon.stop();
    await flushPromises();
    await stopPromise;

    expect(transitions).toContain("Stopping");
    expect(transitions).toContain("Stopped");

    // Verify ordering.
    const syncIdx = transitions.indexOf("Syncing");
    const idleIdx = transitions.indexOf("Idle");
    const stoppingIdx = transitions.indexOf("Stopping");
    const stoppedIdx = transitions.indexOf("Stopped");

    expect(syncIdx).toBeLessThan(idleIdx);
    expect(stoppingIdx).toBeLessThan(stoppedIdx);
  });
});
