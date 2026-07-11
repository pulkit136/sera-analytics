import { describe, expect, it } from "vitest";
import { ValidationError } from "./errors.js";
import { calculateSyncRange } from "./sync.js";

describe("Block Synchronization Calculation", () => {
  it("should start from startBlock when currentIndexedBlock is null", () => {
    const result = calculateSyncRange({
      startBlock: 100,
      latestBlock: 150,
      currentIndexedBlock: null,
      batchSize: 10,
    });

    expect(result).toEqual({
      nextFromBlock: 100,
      nextToBlock: 109,
      isCaughtUp: false,
      remainingBlocks: 41,
    });
  });

  it("should start from currentIndexedBlock + 1 when it exists", () => {
    const result = calculateSyncRange({
      startBlock: 100,
      latestBlock: 150,
      currentIndexedBlock: 119,
      batchSize: 10,
    });

    expect(result).toEqual({
      nextFromBlock: 120,
      nextToBlock: 129,
      isCaughtUp: false,
      remainingBlocks: 21,
    });
  });

  it("should handle already caught up edge case", () => {
    const result = calculateSyncRange({
      startBlock: 100,
      latestBlock: 150,
      currentIndexedBlock: 150,
      batchSize: 10,
    });

    expect(result).toEqual({
      nextFromBlock: 151,
      nextToBlock: 150, // Empty range
      isCaughtUp: true,
      remainingBlocks: 0,
    });
  });

  it("should handle exactly one batch remaining", () => {
    const result = calculateSyncRange({
      startBlock: 100,
      latestBlock: 150,
      currentIndexedBlock: 140,
      batchSize: 10,
    });

    expect(result).toEqual({
      nextFromBlock: 141,
      nextToBlock: 150,
      isCaughtUp: true,
      remainingBlocks: 0,
    });
  });

  it("should handle multiple batches remaining", () => {
    const result = calculateSyncRange({
      startBlock: 100,
      latestBlock: 200,
      currentIndexedBlock: 100,
      batchSize: 10,
    });

    expect(result).toEqual({
      nextFromBlock: 101,
      nextToBlock: 110,
      isCaughtUp: false,
      remainingBlocks: 90,
    });
  });

  it("should handle empty chain (latestBlock is 0)", () => {
    const result = calculateSyncRange({
      startBlock: 100,
      latestBlock: 0,
      currentIndexedBlock: null,
      batchSize: 10,
    });

    expect(result).toEqual({
      nextFromBlock: 100,
      nextToBlock: 99,
      isCaughtUp: true,
      remainingBlocks: 0,
    });
  });

  it("should handle latest block behind configured start block", () => {
    const result = calculateSyncRange({
      startBlock: 200,
      latestBlock: 150,
      currentIndexedBlock: null,
      batchSize: 10,
    });

    expect(result).toEqual({
      nextFromBlock: 200,
      nextToBlock: 199,
      isCaughtUp: true,
      remainingBlocks: 0,
    });
  });

  it("should throw ValidationError for invalid startBlock inputs", () => {
    expect(() =>
      calculateSyncRange({
        startBlock: -1,
        latestBlock: 100,
        currentIndexedBlock: null,
        batchSize: 10,
      }),
    ).toThrow(ValidationError);

    expect(() =>
      calculateSyncRange({
        startBlock: 1.5,
        latestBlock: 100,
        currentIndexedBlock: null,
        batchSize: 10,
      }),
    ).toThrow(ValidationError);
  });

  it("should throw ValidationError for invalid latestBlock inputs", () => {
    expect(() =>
      calculateSyncRange({
        startBlock: 100,
        latestBlock: -5,
        currentIndexedBlock: null,
        batchSize: 10,
      }),
    ).toThrow(ValidationError);
  });

  it("should throw ValidationError for invalid currentIndexedBlock inputs", () => {
    expect(() =>
      calculateSyncRange({
        startBlock: 100,
        latestBlock: 150,
        currentIndexedBlock: -2,
        batchSize: 10,
      }),
    ).toThrow(ValidationError);

    expect(() =>
      calculateSyncRange({
        startBlock: 100,
        latestBlock: 150,
        currentIndexedBlock: 120.4,
        batchSize: 10,
      }),
    ).toThrow(ValidationError);
  });

  it("should throw ValidationError for invalid batchSize inputs", () => {
    expect(() =>
      calculateSyncRange({
        startBlock: 100,
        latestBlock: 150,
        currentIndexedBlock: null,
        batchSize: 0,
      }),
    ).toThrow(ValidationError);

    expect(() =>
      calculateSyncRange({
        startBlock: 100,
        latestBlock: 150,
        currentIndexedBlock: null,
        batchSize: -5,
      }),
    ).toThrow(ValidationError);
  });
});
