import type { MetadataQueueItem } from "@sera/metadata";
import { describe, expect, it } from "vitest";
import { PersistenceError } from "./errors.js";
import { KyselyMetadataQueue } from "./metadataQueue.js";
import type { DatabaseContext } from "./schema.js";

// ---------------------------------------------------------------------------
// Mock Kysely Builder classes mirroring database package test patterns
// ---------------------------------------------------------------------------

class MockSelect {
  private wheres: unknown[] = [];
  private orderBys: unknown[] = [];
  private limitVal: number | null = null;

  constructor(private mockDb: MockKysely) {}

  select(col: string) {
    return this;
  }

  selectAll() {
    return this;
  }

  where(col: string, op: string, val: unknown) {
    this.wheres.push({ col, op, val });
    return this;
  }

  orderBy(col: string, dir: string) {
    this.orderBys.push({ col, dir });
    return this;
  }

  limit(limit: number) {
    this.limitVal = limit;
    return this;
  }

  async execute() {
    if (this.mockDb.shouldFail) {
      throw new Error("Mock database read error");
    }
    return this.mockDb.mockSelectVal || [];
  }

  async executeTakeFirst() {
    if (this.mockDb.shouldFail) {
      throw new Error("Mock database read error");
    }
    return this.mockDb.mockSelectVal ? this.mockDb.mockSelectVal[0] || null : null;
  }
}

class MockInsert {
  private valuesObj: unknown = null;

  constructor(private mockDb: MockKysely) {}

  values(val: unknown) {
    this.valuesObj = val;
    return this;
  }

  onConflict(cb: unknown) {
    return this;
  }

  async execute() {
    if (this.mockDb.shouldFail) {
      throw new Error("Mock database write error");
    }
    this.mockDb.executedInsert = true;
    this.mockDb.insertedValues.push(this.valuesObj);
  }
}

class MockDelete {
  private wheres: unknown[] = [];

  constructor(private mockDb: MockKysely) {}

  where(col: string, op: string, val: unknown) {
    this.wheres.push({ col, op, val });
    return this;
  }

  async execute() {
    if (this.mockDb.shouldFail) {
      throw new Error("Mock database delete error");
    }
    this.mockDb.executedDelete = true;
  }
}

class MockUpdate {
  private wheres: unknown[] = [];
  private setObj: unknown = null;

  constructor(private mockDb: MockKysely) {}

  set(val: unknown) {
    this.setObj = val;
    return this;
  }

  where(col: string, op: string, val: unknown) {
    this.wheres.push({ col, op, val });
    return this;
  }

  async execute() {
    if (this.mockDb.shouldFail) {
      throw new Error("Mock database update error");
    }
    this.mockDb.executedUpdate = true;
    this.mockDb.updatedSet = this.setObj;
  }
}

class MockKysely {
  public executedInsert = false;
  public executedDelete = false;
  public executedUpdate = false;
  public insertedValues: unknown[] = [];
  public updatedSet: unknown = null;
  public mockSelectVal: unknown = null;
  public shouldFail = false;

  selectFrom(table: string) {
    return new MockSelect(this);
  }

  insertInto(table: string) {
    return new MockInsert(this);
  }

  deleteFrom(table: string) {
    return new MockDelete(this);
  }

  updateTable(table: string) {
    return new MockUpdate(this);
  }

  reset() {
    this.executedInsert = false;
    this.executedDelete = false;
    this.executedUpdate = false;
    this.insertedValues = [];
    this.updatedSet = null;
    this.mockSelectVal = null;
    this.shouldFail = false;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("KyselyMetadataQueue Unit Tests", () => {
  const mockDb = new MockKysely();
  const queue = new KyselyMetadataQueue();
  const context = mockDb as unknown as DatabaseContext;

  const mockItem: MetadataQueueItem = {
    chainId: 1,
    tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    enrichmentType: "ERC20",
    status: "Pending",
    attemptCount: 0,
    runAt: new Date(0).toISOString(),
    lastError: null,
    blockNumberObserved: 1000,
  };

  it("should successfully enqueue items", async () => {
    mockDb.reset();
    await queue.enqueue(context, [mockItem]);

    expect(mockDb.executedInsert).toBe(true);
    expect(mockDb.insertedValues).toHaveLength(1);
    expect((mockDb.insertedValues[0] as Record<string, unknown>[])[0]).toEqual({
      chain_id: 1,
      token_address: mockItem.tokenAddress.toLowerCase(),
      enrichment_type: "ERC20",
      status: "Pending",
      attempt_count: 0,
      run_at: new Date(mockItem.runAt),
      last_error: null,
      block_number_observed: 1000,
    });
  });

  it("should retrieve next pending items and map fields correctly", async () => {
    mockDb.reset();
    const mockRow = {
      chain_id: 1,
      token_address: mockItem.tokenAddress.toLowerCase(),
      enrichment_type: "ERC20",
      status: "Pending",
      attempt_count: 0,
      run_at: new Date(0),
      last_error: null,
      block_number_observed: 1000n,
    };
    mockDb.mockSelectVal = [mockRow];

    const res = await queue.nextPending(context, 10);
    expect(res).toHaveLength(1);
    expect(res[0].tokenAddress).toBe(mockItem.tokenAddress.toLowerCase());
    expect(res[0].blockNumberObserved).toBe(1000);
    expect(res[0].runAt).toBe(new Date(0).toISOString());
  });

  it("should successfully mark job completed (deletes from queue)", async () => {
    mockDb.reset();
    await queue.markCompleted(context, 1, mockItem.tokenAddress);

    expect(mockDb.executedDelete).toBe(true);
  });

  it("should successfully mark job failed", async () => {
    mockDb.reset();
    const nextRun = new Date();
    await queue.markFailed(context, 1, mockItem.tokenAddress, "RPC Failure", nextRun);

    expect(mockDb.executedUpdate).toBe(true);
    expect(mockDb.updatedSet).toBeDefined();
  });

  it("should verify exists returns true/false correctly", async () => {
    mockDb.reset();
    mockDb.mockSelectVal = [{ token_address: mockItem.tokenAddress }];
    let has = await queue.exists(context, 1, mockItem.tokenAddress);
    expect(has).toBe(true);

    mockDb.reset();
    mockDb.mockSelectVal = null;
    has = await queue.exists(context, 1, mockItem.tokenAddress);
    expect(has).toBe(false);
  });

  it("should propagate errors wrapped inside PersistenceError on failure", async () => {
    mockDb.reset();
    mockDb.shouldFail = true;

    await expect(queue.enqueue(context, [mockItem])).rejects.toThrow(PersistenceError);
    await expect(queue.nextPending(context, 10)).rejects.toThrow(PersistenceError);
    await expect(queue.markCompleted(context, 1, mockItem.tokenAddress)).rejects.toThrow(
      PersistenceError,
    );
    await expect(
      queue.markFailed(context, 1, mockItem.tokenAddress, "err", new Date()),
    ).rejects.toThrow(PersistenceError);
    await expect(queue.exists(context, 1, mockItem.tokenAddress)).rejects.toThrow(PersistenceError);
  });
});
