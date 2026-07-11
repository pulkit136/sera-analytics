import { describe, expect, it } from "vitest";
import { LOG_LEVEL_ORDER } from "./LogLevel.js";
import { NoopLogger, NOOP_LOGGER } from "./NoopLogger.js";
import { InMemoryLogger, EPOCH_CLOCK, WALL_CLOCK } from "./InMemoryLogger.js";
import type { TestLogger } from "./Logger.js";

// ---------------------------------------------------------------------------
// LogLevel ordering
// ---------------------------------------------------------------------------

describe("LogLevel ordering", () => {
  it("should have trace < debug < info < warn < error", () => {
    expect(LOG_LEVEL_ORDER.trace).toBeLessThan(LOG_LEVEL_ORDER.debug);
    expect(LOG_LEVEL_ORDER.debug).toBeLessThan(LOG_LEVEL_ORDER.info);
    expect(LOG_LEVEL_ORDER.info).toBeLessThan(LOG_LEVEL_ORDER.warn);
    expect(LOG_LEVEL_ORDER.warn).toBeLessThan(LOG_LEVEL_ORDER.error);
  });
});

// ---------------------------------------------------------------------------
// NoopLogger
// ---------------------------------------------------------------------------

describe("NoopLogger", () => {
  it("should not throw on any log method", () => {
    const logger = new NoopLogger();
    expect(() => logger.trace("msg")).not.toThrow();
    expect(() => logger.debug("msg")).not.toThrow();
    expect(() => logger.info("msg", { field: 1 })).not.toThrow();
    expect(() => logger.warn("msg", { flag: true })).not.toThrow();
    expect(() => logger.error("msg", { error: "oops" })).not.toThrow();
  });

  it("NOOP_LOGGER singleton should expose all five log methods", () => {
    expect(typeof NOOP_LOGGER.trace).toBe("function");
    expect(typeof NOOP_LOGGER.debug).toBe("function");
    expect(typeof NOOP_LOGGER.info).toBe("function");
    expect(typeof NOOP_LOGGER.warn).toBe("function");
    expect(typeof NOOP_LOGGER.error).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// InMemoryLogger — basic behaviour
// ---------------------------------------------------------------------------

describe("InMemoryLogger", () => {
  it("should record entries in insertion order", () => {
    const logger = new InMemoryLogger();
    logger.info("first");
    logger.warn("second");
    logger.error("third");

    expect(logger.entries).toHaveLength(3);
    expect(logger.entries[0].message).toBe("first");
    expect(logger.entries[1].message).toBe("second");
    expect(logger.entries[2].message).toBe("third");
  });

  it("should record the correct log level for each method", () => {
    const logger = new InMemoryLogger();
    logger.trace("t");
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    const levels = logger.entries.map((e) => e.level);
    expect(levels).toEqual(["trace", "debug", "info", "warn", "error"]);
  });

  it("should preserve structured fields exactly", () => {
    const logger = new InMemoryLogger();
    logger.info("Block indexed", { blockNumber: 42, chainId: 1, durationMs: 123.4 });

    const entry = logger.entries[0];
    expect(entry.fields.blockNumber).toBe(42);
    expect(entry.fields.chainId).toBe(1);
    expect(entry.fields.durationMs).toBe(123.4);
  });

  it("should record empty fields object when none are provided", () => {
    const logger = new InMemoryLogger();
    logger.info("No fields");

    expect(logger.entries[0].fields).toEqual({});
  });

  it("should use EPOCH_CLOCK by default for test stability", () => {
    const logger = new InMemoryLogger();
    logger.info("timestamped event");

    expect(logger.entries[0].timestamp).toBe(new Date(0).toISOString());
  });

  it("should use the injected Clock for timestamps", () => {
    const fixedTimestamp = "2026-01-15T10:00:00.000Z";
    const fixedClock = () => fixedTimestamp;
    const logger = new InMemoryLogger("trace", fixedClock);

    logger.info("event");

    expect(logger.entries[0].timestamp).toBe(fixedTimestamp);
  });

  it("WALL_CLOCK should return a valid ISO 8601 timestamp", () => {
    const ts = WALL_CLOCK();
    expect(() => new Date(ts)).not.toThrow();
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it("should record immutable entries (frozen objects)", () => {
    const logger = new InMemoryLogger();
    logger.info("immutable check", { key: "value" });

    const entry = logger.entries[0];
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.fields)).toBe(true);

    expect(() => {
      (entry as Record<string, unknown>).message = "mutated";
    }).toThrow();
  });

  it("should support clear() resetting all entries", () => {
    const logger = new InMemoryLogger();
    logger.info("one");
    logger.info("two");
    expect(logger.entries).toHaveLength(2);

    logger.clear();
    expect(logger.entries).toHaveLength(0);
  });

  it("should respect minLevel threshold — skipping entries below it", () => {
    const logger = new InMemoryLogger("warn");
    logger.trace("trace msg");
    logger.debug("debug msg");
    logger.info("info msg");
    logger.warn("warn msg");
    logger.error("error msg");

    expect(logger.entries).toHaveLength(2);
    expect(logger.entries[0].level).toBe("warn");
    expect(logger.entries[1].level).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// TestLogger — structural contract
// ---------------------------------------------------------------------------

describe("TestLogger interface", () => {
  it("InMemoryLogger should satisfy the TestLogger contract", () => {
    const logger: TestLogger = new InMemoryLogger();
    logger.info("structural check");

    expect(logger.entries).toHaveLength(1);
    logger.clear();
    expect(logger.entries).toHaveLength(0);
  });
});
