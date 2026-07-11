import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import {
  down as downLayer1,
  up as upLayer1,
} from "./migrations/20260711000000_create_layer1_tables.js";
import {
  down as downMetadata,
  up as upMetadata,
} from "./migrations/20260711000003_create_token_metadata.js";
import {
  down as downMetadataQueue,
  up as upMetadataQueue,
} from "./migrations/20260711000004_create_metadata_queue.js";

class MockSchema {
  public createdTables: string[] = [];
  public createdIndexes: string[] = [];
  public droppedTables: string[] = [];

  createTable(name: string) {
    this.createdTables.push(name);
    return this;
  }

  addColumn(name: string, type: unknown, cb?: unknown) {
    return this;
  }

  addPrimaryKeyConstraint(name: string, cols: string[]) {
    return this;
  }

  createIndex(name: string) {
    this.createdIndexes.push(name);
    return this;
  }

  on(table: string) {
    return this;
  }

  column(col: string) {
    return this;
  }

  dropTable(name: string) {
    this.droppedTables.push(name);
    return this;
  }

  ifExists() {
    return this;
  }

  ifNotExists() {
    return this;
  }

  dropIndex(name: string) {
    return this;
  }

  columns(cols: string[]) {
    return this;
  }

  async execute() {
    return Promise.resolve();
  }
}

class MockKysely {
  public schema: MockSchema;
  public executedQueries: unknown[] = [];

  constructor() {
    this.schema = new MockSchema();
  }

  getExecutor() {
    return {
      compileQuery: (query: unknown) => {
        return {
          sql: "MOCK SQL",
          parameters: [],
          query: {},
        };
      },
      executeQuery: async (compiledQuery: unknown) => {
        this.executedQueries.push(compiledQuery);
        return { rows: [] };
      },
      transformQuery: (node: unknown) => node,
    };
  }
}

describe("Layer 1 Kysely Migration Tests", () => {
  it("should successfully create all expected tables and indexes in up() migration", async () => {
    const mockDb = new MockKysely();

    await upLayer1(mockDb as unknown as Kysely<unknown>);

    expect(mockDb.schema.createdTables).toEqual([
      "raw_deposits",
      "raw_withdrawals",
      "raw_trades",
      "raw_swaps",
      "raw_swap_legs",
      "raw_failed_matches",
      "raw_failed_intents",
    ]);

    expect(mockDb.schema.createdIndexes).toEqual([
      "idx_raw_deposits_user",
      "idx_raw_deposits_token",
      "idx_raw_withdrawals_user",
      "idx_raw_withdrawals_token",
      "idx_raw_trades_user_0",
      "idx_raw_trades_user_1",
      "idx_raw_swaps_taker",
      "idx_raw_swap_legs_intent",
    ]);
  });

  it("should successfully drop all tables in down() rollback migration", async () => {
    const mockDb = new MockKysely();

    await downLayer1(mockDb as unknown as Kysely<unknown>);

    // Rollback drops tables in reverse dependency order
    expect(mockDb.schema.droppedTables).toEqual([
      "raw_failed_intents",
      "raw_failed_matches",
      "raw_swap_legs",
      "raw_swaps",
      "raw_trades",
      "raw_withdrawals",
      "raw_deposits",
    ]);
  });
});

describe("Token Metadata Kysely Migration Tests", () => {
  it("should successfully create table and indexes, and execute raw sql check constraints in up()", async () => {
    const mockDb = new MockKysely();

    await upMetadata(mockDb as unknown as Kysely<unknown>);

    expect(mockDb.schema.createdTables).toEqual(["token_metadata"]);
    expect(mockDb.schema.createdIndexes).toEqual(["idx_token_metadata_observed"]);
    expect(mockDb.executedQueries).toHaveLength(1);
  });

  it("should successfully drop table and indexes in down()", async () => {
    const mockDb = new MockKysely();

    await downMetadata(mockDb as unknown as Kysely<unknown>);

    expect(mockDb.schema.droppedTables).toEqual(["token_metadata"]);
  });
});

describe("Metadata Queue Kysely Migration Tests", () => {
  it("should successfully create table, index, and check constraints in up()", async () => {
    const mockDb = new MockKysely();

    await upMetadataQueue(mockDb as unknown as Kysely<unknown>);

    expect(mockDb.schema.createdTables).toEqual(["metadata_queue"]);
    expect(mockDb.schema.createdIndexes).toEqual(["idx_metadata_queue_pending"]);
    expect(mockDb.executedQueries).toHaveLength(1);
  });

  it("should successfully drop table in down()", async () => {
    const mockDb = new MockKysely();

    await downMetadataQueue(mockDb as unknown as Kysely<unknown>);

    expect(mockDb.schema.droppedTables).toEqual(["metadata_queue"]);
  });
});
