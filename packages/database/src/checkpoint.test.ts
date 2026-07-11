import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { PostgreSqlCheckpointStore } from "./checkpoint.js";
import { CheckpointError } from "./errors.js";
import type { DatabaseContext, DatabaseSchema } from "./schema.js";

class MockSelect {
  constructor(private mockDb: MockKysely) {}

  select(col: string) {
    return this;
  }

  where(col: string, op: string, val: unknown) {
    return this;
  }

  async executeTakeFirst() {
    return this.mockDb.mockSelectResult();
  }
}

class MockInsert {
  constructor(private mockDb: MockKysely) {}

  values(val: unknown) {
    return this;
  }

  onConflict(cb: unknown) {
    return this;
  }

  async execute() {
    if (this.mockDb.shouldFail) {
      throw new Error("Mock database error");
    }
    this.mockDb.executedInsert = true;
  }
}

class MockKysely {
  public executedInsert = false;
  public mockSelectVal: unknown = null;
  public shouldFail = false;

  selectFrom(table: string) {
    return new MockSelect(this);
  }

  insertInto(table: string) {
    return new MockInsert(this);
  }

  transaction() {
    return {
      execute: async (callback: (trx: MockKysely) => Promise<unknown>) => {
        if (this.shouldFail) {
          throw new Error("Mock DB error");
        }
        return callback(this);
      },
    };
  }

  mockSelectResult() {
    if (this.shouldFail) {
      throw new Error("Mock DB error");
    }
    return this.mockSelectVal;
  }

  reset() {
    this.executedInsert = false;
    this.mockSelectVal = null;
    this.shouldFail = false;
  }
}

describe("PostgreSqlCheckpointStore Unit Tests", () => {
  const mockDb = new MockKysely();
  const store = new PostgreSqlCheckpointStore();
  const context = mockDb as unknown as DatabaseContext;

  it("should return null for nonexistent checkpoints", async () => {
    mockDb.reset();
    mockDb.mockSelectVal = undefined; // No row found

    const block = await store.getCheckpoint(context, "sera-mainnet-indexer", 1);
    expect(block).toBeNull();
  });

  it("should successfully retrieve an existing checkpoint block number", async () => {
    mockDb.reset();
    mockDb.mockSelectVal = { latest_indexed_block: 54321n };

    const block = await store.getCheckpoint(context, "sera-mainnet-indexer", 1);
    expect(block).toBe(54321);
  });

  it("should successfully create/upsert checkpoints atomically", async () => {
    mockDb.reset();
    expect(mockDb.executedInsert).toBe(false);

    await store.saveCheckpoint(context, "sera-mainnet-indexer", 1, 60000);
    expect(mockDb.executedInsert).toBe(true);
  });

  it("should propagate errors wrapped inside CheckpointError on retrieval failure", async () => {
    mockDb.reset();
    mockDb.shouldFail = true;

    await expect(store.getCheckpoint(context, "sera-mainnet-indexer", 1)).rejects.toThrow(
      CheckpointError,
    );
  });

  it("should propagate errors wrapped inside CheckpointError on update failure", async () => {
    mockDb.reset();
    mockDb.shouldFail = true;

    await expect(store.saveCheckpoint(context, "sera-mainnet-indexer", 1, 60000)).rejects.toThrow(
      CheckpointError,
    );
  });
});
