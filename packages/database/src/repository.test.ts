import type { NormalizedRecord } from "@sera/contracts";
import { describe, expect, it } from "vitest";
import { PersistenceError } from "./errors.js";
import { KyselyRecordRepository } from "./repository.js";
import type { DatabaseContext } from "./schema.js";

// Minimal mock builder to simulate Kysely query calls
class MockBuilder {
  private valuesObj: unknown = null;
  private onConflictCb: unknown = null;

  constructor(private mockDb: MockKysely) {}

  values(val: unknown) {
    this.valuesObj = val;
    return this;
  }

  onConflict(cb: unknown) {
    this.onConflictCb = cb;
    return this;
  }

  returningAll() {
    return this;
  }

  async executeTakeFirst() {
    if (this.mockDb.shouldFail) {
      throw new Error("Mock database error");
    }
    return this.mockDb.mockResult(this.valuesObj);
  }
}

class MockKysely {
  public tablesCalled: string[] = [];
  public shouldFail = false;
  public mockReturns: unknown[] = [];
  public currentReturnIndex = 0;

  insertInto(table: string) {
    this.tablesCalled.push(table);
    return new MockBuilder(this);
  }

  mockResult(values: unknown) {
    const idx = this.currentReturnIndex;
    this.currentReturnIndex++;
    if (idx < this.mockReturns.length) {
      return this.mockReturns[idx];
    }
    // Default mock behavior is to succeed and return the values (mocking row inserted/updated)
    return values;
  }

  reset() {
    this.tablesCalled = [];
    this.shouldFail = false;
    this.mockReturns = [];
    this.currentReturnIndex = 0;
  }
}

describe("KyselyRecordRepository Unit Tests", () => {
  const mockDb = new MockKysely();
  const repository = new KyselyRecordRepository();
  const context = mockDb as unknown as DatabaseContext;

  const baseRecordProps = {
    tx_hash: "0xabc",
    block_number: 1234,
  };

  it("should process empty input batches gracefully without calling db", async () => {
    mockDb.reset();
    const result = await repository.saveRecords(context, []);
    expect(result.inserted).toEqual([]);
    expect(result.statistics.insertedCount).toBe(0);
    expect(mockDb.tablesCalled).toEqual([]);
  });

  it("should successfully insert unique normalized records inside the context", async () => {
    mockDb.reset();
    const records: NormalizedRecord[] = [
      {
        recordType: "user",
        wallet_address: "0xuser",
      },
      {
        recordType: "deposit",
        log_index: 1,
        user_address: "0xuser",
        token_address: "0xtoken",
        amount: "1000",
        ...baseRecordProps,
      },
    ];

    const result = await repository.saveRecords(context, records);

    expect(result.statistics.insertedCount).toBe(2);
    expect(result.statistics.skippedCount).toBe(0);
    expect(result.inserted).toHaveLength(2);
    expect(mockDb.tablesCalled).toEqual(["users", "deposits"]);
  });

  it("should mark records as skipped when conflict doNothing returns undefined (idempotent replay)", async () => {
    mockDb.reset();
    const records: NormalizedRecord[] = [
      {
        recordType: "user",
        wallet_address: "0xuser",
      },
      {
        recordType: "deposit",
        log_index: 1,
        user_address: "0xuser",
        token_address: "0xtoken",
        amount: "1000",
        ...baseRecordProps,
      },
    ];

    // Set mock database to return a user row, but return undefined (skipped/doNothing) for deposit
    mockDb.mockReturns = [
      { wallet_address: "0xuser" }, // User upsert returns successfully
      undefined, // Deposit conflict resolution skipped insertion
    ];

    const result = await repository.saveRecords(context, records);

    expect(result.statistics.insertedCount).toBe(1); // Only user was counted
    expect(result.statistics.skippedCount).toBe(1); // Deposit was skipped
    expect(result.inserted[0].recordType).toBe("user");
    expect(result.skipped[0].recordType).toBe("deposit");
  });

  it("should rollback / throw on exception", async () => {
    mockDb.reset();
    const records: NormalizedRecord[] = [
      {
        recordType: "trade",
        trade_id: "0x123",
        order_hash_0: "0xh0",
        order_hash_1: "0xh1",
        user_0: "0xu0",
        user_1: "0xu1",
        token_0: "0xt0",
        token_1: "0xt1",
        match_amount_0: "10",
        match_amount_1: "20",
        price_0_to_1: "2",
        ...baseRecordProps,
      },
    ];

    mockDb.shouldFail = true;

    await expect(repository.saveRecords(context, records)).rejects.toThrow(PersistenceError);
  });

  it("should preserve execution ordering (Users first) to prevent foreign key errors", async () => {
    mockDb.reset();
    // Pass deposit first, user second. The repository should process User first.
    const records: NormalizedRecord[] = [
      {
        recordType: "deposit",
        log_index: 2,
        user_address: "0xuser",
        token_address: "0xtoken",
        amount: "500",
        ...baseRecordProps,
      },
      {
        recordType: "user",
        wallet_address: "0xuser",
      },
    ];

    await repository.saveRecords(context, records);

    // Verify ordering in tablesCalled: users first, then deposits
    expect(mockDb.tablesCalled).toEqual(["users", "deposits"]);
  });
});
