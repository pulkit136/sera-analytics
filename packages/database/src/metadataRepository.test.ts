import type { TokenIdentifier, TokenMetadata } from "@sera/metadata";
import { describe, expect, it, vi } from "vitest";
import { PersistenceError } from "./errors.js";
import { KyselyMetadataRepository } from "./metadataRepository.js";
import type { DatabaseContext } from "./schema.js";

// ---------------------------------------------------------------------------
// Mock Kysely Builder classes mirroring monorepo patterns
// ---------------------------------------------------------------------------

class MockSelect {
  private wheres: unknown[] = [];

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

  async executeTakeFirst() {
    if (this.mockDb.shouldFail) {
      throw new Error("Mock database read error");
    }
    return this.mockDb.mockSelectResult();
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

class MockKysely {
  public executedInsert = false;
  public insertedValues: unknown[] = [];
  public mockSelectVal: unknown = null;
  public shouldFail = false;

  selectFrom(table: string) {
    return new MockSelect(this);
  }

  insertInto(table: string) {
    return new MockInsert(this);
  }

  mockSelectResult() {
    return this.mockSelectVal;
  }

  reset() {
    this.executedInsert = false;
    this.insertedValues = [];
    this.mockSelectVal = null;
    this.shouldFail = false;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("KyselyMetadataRepository Unit Tests", () => {
  const mockDb = new MockKysely();
  const repository = new KyselyMetadataRepository();
  const context = mockDb as unknown as DatabaseContext;

  const mockToken: TokenIdentifier = {
    chainId: 1,
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  };

  const mockMetadata: TokenMetadata = {
    identifier: mockToken,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logoUri: null,
    source: "OnChain",
    fetchedAt: new Date(0).toISOString(),
    isComplete: true,
    blockNumberObserved: 15000000,
  };

  it("should successfully upsert a single metadata record", async () => {
    mockDb.reset();
    await repository.upsert(context, mockMetadata);

    expect(mockDb.executedInsert).toBe(true);
    expect(mockDb.insertedValues).toHaveLength(1);
    expect(mockDb.insertedValues[0]).toEqual({
      chain_id: 1,
      token_address: mockToken.address.toLowerCase(),
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
      source: "OnChain",
      block_number_observed: 15000000,
    });
  });

  it("should successfully execute batch upserts (upsertMany)", async () => {
    mockDb.reset();
    const list: TokenMetadata[] = [
      mockMetadata,
      {
        ...mockMetadata,
        identifier: { chainId: 1, address: "0x123" },
        symbol: "TST",
      },
    ];

    await repository.upsertMany(context, list);

    expect(mockDb.insertedValues).toHaveLength(2);
    expect(mockDb.insertedValues[0].symbol).toBe("USDC");
    expect(mockDb.insertedValues[1].symbol).toBe("TST");
  });

  it("should find an existing metadata record and map it to domain model", async () => {
    mockDb.reset();
    mockDb.mockSelectVal = {
      chain_id: 1,
      token_address: mockToken.address.toLowerCase(),
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
      source: "OnChain",
      block_number_observed: 15000000n,
    };

    const res = await repository.find(context, mockToken);
    expect(res).toBeDefined();
    expect(res!.identifier.chainId).toBe(1);
    expect(res!.identifier.address).toBe(mockToken.address.toLowerCase());
    expect(res!.symbol).toBe("USDC");
    expect(res!.decimals).toBe(6);
    expect(res!.isComplete).toBe(true);
    expect(res!.blockNumberObserved).toBe(15000000);
  });

  it("should return null when searching for nonexistent metadata", async () => {
    mockDb.reset();
    mockDb.mockSelectVal = undefined;

    const res = await repository.find(context, mockToken);
    expect(res).toBeNull();
  });

  it("should verify exists returns true/false correctly", async () => {
    mockDb.reset();
    mockDb.mockSelectVal = { token_address: mockToken.address.toLowerCase() };
    let has = await repository.exists(context, mockToken);
    expect(has).toBe(true);

    mockDb.reset();
    mockDb.mockSelectVal = undefined;
    has = await repository.exists(context, mockToken);
    expect(has).toBe(false);
  });

  it("should propagate errors wrapped inside PersistenceError on upsert failure", async () => {
    mockDb.reset();
    mockDb.shouldFail = true;

    await expect(repository.upsert(context, mockMetadata)).rejects.toThrow(PersistenceError);
  });

  it("should propagate errors wrapped inside PersistenceError on find failure", async () => {
    mockDb.reset();
    mockDb.shouldFail = true;

    await expect(repository.find(context, mockToken)).rejects.toThrow(PersistenceError);
  });

  it("should propagate errors wrapped inside PersistenceError on exists failure", async () => {
    mockDb.reset();
    mockDb.shouldFail = true;

    await expect(repository.exists(context, mockToken)).rejects.toThrow(PersistenceError);
  });
});
