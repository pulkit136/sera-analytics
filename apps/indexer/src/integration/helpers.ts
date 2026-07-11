import { expect } from "vitest";
import {
  KyselyRecordRepository,
  PostgreSqlCheckpointStore,
  PostgreSqlBlockMetadataStore,
  KyselyMetadataRepository,
  KyselyMetadataQueue,
} from "@sera/database";
import {
  type BlockchainReader,
  AbiEventDecoder,
  DefaultEventNormalizer,
} from "@sera/contracts";
import {
  DefaultMetadataPipeline,
  DefaultMetadataProcessorRegistry,
  ERC20MetadataProcessor,
} from "@sera/metadata";
import { IndexingPipeline } from "../pipeline.js";

// ---------------------------------------------------------------------------
// MockQueryBuilder
// ---------------------------------------------------------------------------

class MockQueryBuilder {
  private wheres: any[] = [];
  private orderBys: any[] = [];
  private limitVal?: number;
  private valuesObj: any = null;
  private onConflictCb?: (oc: any) => any;
  private setObj: any = null;

  constructor(private db: MockKyselyDatabase, private table: string) {}

  select(col: string) { return this; }
  selectAll() { return this; }
  where(col: string, op: string, val: any) {
    this.wheres.push({ col, op, val });
    return this;
  }
  orderBy(col: string, dir?: string) {
    this.orderBys.push({ col, dir });
    return this;
  }
  limit(val: number) {
    this.limitVal = val;
    return this;
  }
  values(val: any) {
    this.valuesObj = val;
    return this;
  }
  onConflict(cb: any) {
    this.onConflictCb = cb;
    return this;
  }
  returningAll() { return this; }
  set(val: any) {
    this.setObj = val;
    return this;
  }

  async execute() {
    return this.db.runQuery(this.table, {
      type: this.setObj ? 'update' : (this.valuesObj ? 'insert' : 'select'),
      wheres: this.wheres,
      orderBys: this.orderBys,
      limit: this.limitVal,
      values: this.valuesObj,
      onConflictCb: this.onConflictCb,
      set: this.setObj
    });
  }

  async executeTakeFirst() {
    const rows = await this.execute();
    return rows[0];
  }
}

// ---------------------------------------------------------------------------
// MockDeleteBuilder
// ---------------------------------------------------------------------------

class MockDeleteBuilder {
  private wheres: any[] = [];
  constructor(private db: MockKyselyDatabase, private table: string) {}
  where(col: string, op: string, val: any) {
    this.wheres.push({ col, op, val });
    return this;
  }
  async execute() {
    return this.db.runQuery(this.table, {
      type: 'delete',
      wheres: this.wheres
    });
  }
}

// ---------------------------------------------------------------------------
// MockKyselyDatabase
// ---------------------------------------------------------------------------

export class MockKyselyDatabase {
  public tables: Record<string, any[]> = {
    checkpoints: [],
    block_metadata: [],
    users: [],
    deposits: [],
    withdrawals: [],
    trades: [],
    order_fills: [],
    swaps: [],
    token_metadata: [],
    metadata_queue: []
  };

  selectFrom(table: string) {
    return new MockQueryBuilder(this, table);
  }
  insertInto(table: string) {
    return new MockQueryBuilder(this, table);
  }
  updateTable(table: string) {
    return new MockQueryBuilder(this, table);
  }
  deleteFrom(table: string) {
    return new MockDeleteBuilder(this, table);
  }
  transaction() {
    return {
      execute: async (callback: (trx: any) => Promise<any>) => {
        return callback(this);
      }
    };
  }

  clear() {
    for (const key of Object.keys(this.tables)) {
      this.tables[key] = [];
    }
  }

  async runQuery(table: string, query: any) {
    const list = this.tables[table];
    if (!list) throw new Error(`Table ${table} not found in MockKyselyDatabase`);

    if (query.type === 'select') {
      let result = [...list];
      for (const w of query.wheres) {
        result = result.filter(row => {
          const val = row[w.col];
          if (w.op === '=') return val === w.val;
          if (w.op === '>=') return Number(val) >= Number(w.val);
          if (w.op === '>') return Number(val) > Number(w.val);
          if (w.op === '<=') return Number(val) <= Number(w.val);
          if (w.op === '<') return Number(val) < Number(w.val);
          return true;
        });
      }
      if (query.orderBys.length > 0) {
        result.sort((a, b) => {
          for (const o of query.orderBys) {
            const valA = a[o.col];
            const valB = b[o.col];
            if (valA < valB) return o.dir === 'desc' ? 1 : -1;
            if (valA > valB) return o.dir === 'desc' ? -1 : 1;
          }
          return 0;
        });
      }
      if (query.limit !== undefined) {
        result = result.slice(0, query.limit);
      }
      return result;
    }

    if (query.type === 'insert') {
      const isArray = Array.isArray(query.values);
      const rows = isArray ? query.values : [query.values];
      const insertedRows: any[] = [];

      for (const rawRow of rows) {
        const row = { ...rawRow };
        // Apply schema defaults
        if (table === 'block_metadata') {
          if (row.is_canonical === undefined) row.is_canonical = true;
        } else if (table === 'metadata_queue') {
          if (row.status === undefined) row.status = 'Pending';
          if (row.attempt_count === undefined) row.attempt_count = 0;
        }

        let conflictIndex = -1;
        if (table === 'checkpoints') {
          conflictIndex = list.findIndex(r => r.indexer_name === row.indexer_name);
        } else if (table === 'block_metadata') {
          conflictIndex = list.findIndex(r => r.chain_id === row.chain_id && r.block_number === row.block_number && r.block_hash === row.block_hash);
        } else if (table === 'users') {
          conflictIndex = list.findIndex(r => r.wallet_address === row.wallet_address);
        } else if (table === 'deposits') {
          conflictIndex = list.findIndex(r => r.tx_hash === row.tx_hash && r.log_index === row.log_index);
        } else if (table === 'withdrawals') {
          conflictIndex = list.findIndex(r => r.tx_hash === row.tx_hash && r.log_index === row.log_index);
        } else if (table === 'trades') {
          conflictIndex = list.findIndex(r => r.trade_id === row.trade_id);
        } else if (table === 'order_fills') {
          conflictIndex = list.findIndex(r => r.fill_id === row.fill_id);
        } else if (table === 'swaps') {
          conflictIndex = list.findIndex(r => r.intent_hash === row.intent_hash && r.tx_hash === row.tx_hash);
        } else if (table === 'token_metadata') {
          conflictIndex = list.findIndex(r => r.chain_id === row.chain_id && r.token_address === row.token_address);
        } else if (table === 'metadata_queue') {
          conflictIndex = list.findIndex(r => r.chain_id === row.chain_id && r.token_address === row.token_address);
        }

        if (conflictIndex !== -1) {
          let isDoNothing = false;
          let updateSetObj: any = null;

          const ocMock = {
            column: () => ocMock,
            columns: () => ocMock,
            doNothing: () => { isDoNothing = true; return ocMock; },
            doUpdateSet: (setVal: any) => { updateSetObj = setVal; return ocMock; }
          };

          if (query.onConflictCb) {
            query.onConflictCb(ocMock);
          }

          if (!isDoNothing && updateSetObj) {
            list[conflictIndex] = { ...list[conflictIndex], ...updateSetObj };
            insertedRows.push(list[conflictIndex]);
          }
        } else {
          list.push(row);
          insertedRows.push(row);
        }
      }
      return insertedRows;
    }

    if (query.type === 'delete') {
      let removedCount = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        let matches = true;
        for (const w of query.wheres) {
          const val = list[i][w.col];
          if (w.op === '=') matches = matches && (val === w.val);
          if (w.op === '>=') matches = matches && (Number(val) >= Number(w.val));
          if (w.op === '>') matches = matches && (Number(val) > Number(w.val));
          if (w.op === '<=') matches = matches && (Number(val) <= Number(w.val));
          if (w.op === '<') matches = matches && (Number(val) < Number(w.val));
        }
        if (matches) {
          list.splice(i, 1);
          removedCount++;
        }
      }
      return { numDeletedRows: BigInt(removedCount) };
    }

    if (query.type === 'update') {
      let result = [];
      for (let i = 0; i < list.length; i++) {
        let matches = true;
        for (const w of query.wheres) {
          const val = list[i][w.col];
          if (w.op === '=') matches = matches && (val === w.val);
          if (w.op === '>=') matches = matches && (Number(val) >= Number(w.val));
          if (w.op === '>') matches = matches && (Number(val) > Number(w.val));
          if (w.op === '<=') matches = matches && (Number(val) <= Number(w.val));
          if (w.op === '<') matches = matches && (Number(val) < Number(w.val));
        }
        if (matches) {
          const updateObj = { ...query.set };
          for (const key of Object.keys(updateObj)) {
            const val = updateObj[key];
            if (val && typeof val === 'object') {
              if (key === 'attempt_count') {
                updateObj[key] = (list[i].attempt_count || 0) + 1;
              } else if (key === 'status') {
                const nextAttempt = (list[i].attempt_count || 0) + 1;
                updateObj[key] = nextAttempt >= 5 ? 'Dead' : 'Failed';
              }
            }
          }
          list[i] = { ...list[i], ...updateObj };
          result.push(list[i]);
        }
      }
      return result;
    }

    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Clears the mock database tables to guarantee isolated tests.
 */
export async function setupTestDb(db: MockKyselyDatabase): Promise<void> {
  db.clear();
}

/**
 * Builds the real production IndexingPipeline with all actual components,
 * but overrides the Kysely database with our MockKyselyDatabase.
 */
export function createProductionPipeline(
  reader: BlockchainReader,
  db: MockKyselyDatabase,
): IndexingPipeline {
  const decoder = new AbiEventDecoder();
  const normalizer = new DefaultEventNormalizer();
  const repository = new KyselyRecordRepository();
  const checkpointStore = new PostgreSqlCheckpointStore();
  const blockMetadataStore = new PostgreSqlBlockMetadataStore();

  return new IndexingPipeline(
    reader,
    decoder,
    normalizer,
    repository,
    checkpointStore,
    db as any,
    undefined,
    blockMetadataStore,
    { maxRollbackDepth: 100 },
  );
}

/**
 * Builds the real production MetadataPipeline.
 */
export function createProductionMetadataPipeline(
  db: MockKyselyDatabase,
  mockErc20Provider: any,
): DefaultMetadataPipeline {
  const queue = new KyselyMetadataQueue();
  const repository = new KyselyMetadataRepository();
  const registry = new DefaultMetadataProcessorRegistry();

  const processor = new ERC20MetadataProcessor(mockErc20Provider);
  registry.register(processor);

  return new DefaultMetadataPipeline(queue, repository, registry);
}

/**
 * Serializes all rows from all tables in the database, ordered deterministically.
 */
export async function serializeDatabaseState(db: MockKyselyDatabase): Promise<Record<string, any>> {
  const tables = [
    "checkpoints",
    "block_metadata",
    "users",
    "deposits",
    "withdrawals",
    "trades",
    "swaps",
    "token_metadata",
    "metadata_queue",
  ] as const;

  const state: Record<string, any> = {};

  for (const table of tables) {
    let list = [...db.tables[table]];

    // Deterministic sorting
    if (table === "checkpoints") {
      list.sort((a, b) => a.indexer_name.localeCompare(b.indexer_name) || a.chain_id - b.chain_id);
    } else if (table === "block_metadata") {
      list.sort((a, b) => a.chain_id - b.chain_id || a.block_number - b.block_number || a.block_hash.localeCompare(b.block_hash));
    } else if (table === "users") {
      list.sort((a, b) => a.wallet_address.localeCompare(b.wallet_address));
    } else if (table === "deposits") {
      list.sort((a, b) => a.tx_hash.localeCompare(b.tx_hash) || a.log_index - b.log_index);
    } else if (table === "withdrawals") {
      list.sort((a, b) => a.tx_hash.localeCompare(b.tx_hash) || a.log_index - b.log_index);
    } else if (table === "trades") {
      list.sort((a, b) => a.tx_hash.localeCompare(b.tx_hash) || a.trade_id.localeCompare(b.trade_id));
    } else if (table === "swaps") {
      list.sort((a, b) => a.intent_hash.localeCompare(b.intent_hash) || a.tx_hash.localeCompare(b.tx_hash));
    } else if (table === "token_metadata") {
      list.sort((a, b) => a.chain_id - b.chain_id || a.token_address.localeCompare(b.token_address));
    } else if (table === "metadata_queue") {
      list.sort((a, b) => a.chain_id - b.chain_id || a.token_address.localeCompare(b.token_address));
    }

    state[table] = JSON.parse(
      JSON.stringify(list, (key, value) => {
        if (key === "created_at" || key === "updated_at" || key === "first_active_at" || key === "last_active_at" || key === "block_timestamp" || key === "run_at") {
          return "PINNED_TIMESTAMP";
        }
        return value;
      })
    );
  }

  return state;
}

/**
 * Asserts that the contents of Database A are identical to Database B.
 */
export async function assertDbEquals(
  dbA: MockKyselyDatabase,
  dbB: MockKyselyDatabase,
): Promise<void> {
  const stateA = await serializeDatabaseState(dbA);
  const stateB = await serializeDatabaseState(dbB);
  expect(stateA).toEqual(stateB);
}
