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
    raw_deposits: [],
    raw_withdrawals: [],
    raw_trades: [],
    raw_order_fills: [],
    raw_swaps: [],
    raw_swap_legs: [],
    raw_failed_matches: [],
    raw_failed_intents: [],
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
          const op = w.op;
          const target = w.val;
          let match = false;
          if (op === "=" || op === "==") match = val === target;
          else if (op === "in") match = Array.isArray(target) && target.includes(val);
          else if (op === "<=") match = val <= target;
          else if (op === ">=") match = val >= target;
          else if (op === "<") match = val < target;
          else if (op === ">") match = val > target;
          else if (op === "!=") match = val !== target;
          else match = val === target;
          return match;
        });
      }
      if (query.orderBys.length > 0) {
        result.sort((a, b) => {
          for (const o of query.orderBys) {
            const va = a[o.col];
            const vb = b[o.col];
            if (va < vb) return o.dir === 'desc' ? 1 : -1;
            if (va > vb) return o.dir === 'desc' ? -1 : 1;
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
      const records = Array.isArray(query.values) ? query.values : [query.values];
      const insertedRows: any[] = [];

      for (const rec of records) {
        // Resolve PK conflicts
        let isConflict = false;
        if (table === 'checkpoints') {
          isConflict = list.some(row => row.indexer_name === rec.indexer_name && row.chain_id === rec.chain_id);
        } else if (table === 'block_metadata') {
          if (rec.is_canonical === undefined) {
            rec.is_canonical = true;
          }
          isConflict = list.some(row => row.chain_id === rec.chain_id && row.block_number === rec.block_number && row.block_hash === rec.block_hash);
        } else if (table === 'raw_deposits') {
          isConflict = list.some(row => row.tx_hash === rec.tx_hash && row.log_index === rec.log_index && row.chain_id === rec.chain_id);
        } else if (table === 'raw_withdrawals') {
          isConflict = list.some(row => row.tx_hash === rec.tx_hash && row.log_index === rec.log_index && row.chain_id === rec.chain_id);
        } else if (table === 'raw_trades') {
          isConflict = list.some(row => row.tx_hash === rec.tx_hash && row.log_index === rec.log_index && row.chain_id === rec.chain_id);
        } else if (table === 'raw_order_fills') {
          isConflict = list.some(row => row.fill_id === rec.fill_id);
        } else if (table === 'raw_swaps') {
          isConflict = list.some(row => row.intent_hash === rec.intent_hash && row.tx_hash === rec.tx_hash && row.chain_id === rec.chain_id);
        } else if (table === 'token_metadata') {
          isConflict = list.some(row => row.chain_id === rec.chain_id && row.token_address === rec.token_address);
        } else if (table === 'metadata_queue') {
          isConflict = list.some(row => row.chain_id === rec.chain_id && row.token_address === rec.token_address);
        }

        if (isConflict) {
          // If update constraint
          if (query.onConflictCb) {
            const builder = {
              column: () => builder,
              columns: () => builder,
              doUpdateSet: (updates: any) => {
                let match: any = null;
                if (table === 'checkpoints') {
                  match = list.find(row => row.indexer_name === rec.indexer_name && row.chain_id === rec.chain_id);
                } else if (table === 'block_metadata') {
                  match = list.find(row => row.chain_id === rec.chain_id && row.block_number === rec.block_number && row.block_hash === rec.block_hash);
                } else if (table === 'token_metadata') {
                  match = list.find(row => row.chain_id === rec.chain_id && row.token_address === rec.token_address);
                } else if (table === 'metadata_queue') {
                  match = list.find(row => row.chain_id === rec.chain_id && row.token_address === rec.token_address);
                }
                if (match) {
                  Object.assign(match, updates);
                  insertedRows.push(match);
                }
              },
              doNothing: () => {}
            };
            query.onConflictCb(builder);
          }
        } else {
          list.push(rec);
          insertedRows.push(rec);
        }
      }
      return insertedRows;
    }

    if (query.type === 'update') {
      let updatedCount = 0;
      for (const row of list) {
        let matches = true;
        for (const w of query.wheres) {
          if (row[w.col] !== w.val) matches = false;
        }
        if (matches) {
          for (const [k, val] of Object.entries(query.set)) {
            if (val && typeof val === "object" && typeof (val as any).toOperationNode === "function") {
              if (k === "attempt_count") {
                row[k] = (row[k] || 0) + 1;
              } else if (k === "status") {
                row[k] = (row["attempt_count"] || 0) >= 5 ? "Dead" : "Failed";
              }
            } else {
              row[k] = val;
            }
          }
          updatedCount++;
        }
      }
      return [{ numUpdatedRows: BigInt(updatedCount) }];
    }

    if (query.type === 'delete') {
      let deletedCount = 0;
      this.tables[table] = list.filter(row => {
        let matches = true;
        for (const w of query.wheres) {
          if (row[w.col] !== w.val) matches = false;
        }
        if (matches) {
          deletedCount++;
          return false;
        }
        return true;
      });
      return [{ numDeletedRows: BigInt(deletedCount) }];
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
    "raw_deposits",
    "raw_withdrawals",
    "raw_trades",
    "raw_order_fills",
    "raw_swaps",
    "token_metadata",
    "metadata_queue",
  ] as const;

  const state: Record<string, any> = {};

  for (const table of tables) {
    let list = [...(db.tables[table] || [])];

    // Deterministic sorting
    if (table === "checkpoints") {
      list.sort((a, b) => a.indexer_name.localeCompare(b.indexer_name) || a.chain_id - b.chain_id);
    } else if (table === "block_metadata") {
      list.sort((a, b) => a.chain_id - b.chain_id || a.block_number - b.block_number || a.block_hash.localeCompare(b.block_hash));
    } else if (table === "raw_deposits") {
      list.sort((a, b) => a.tx_hash.localeCompare(b.tx_hash) || a.log_index - b.log_index || a.chain_id - b.chain_id);
    } else if (table === "raw_withdrawals") {
      list.sort((a, b) => a.tx_hash.localeCompare(b.tx_hash) || a.log_index - b.log_index || a.chain_id - b.chain_id);
    } else if (table === "raw_trades") {
      list.sort((a, b) => a.tx_hash.localeCompare(b.tx_hash) || a.log_index - b.log_index || a.chain_id - b.chain_id);
    } else if (table === "raw_order_fills") {
      list.sort((a, b) => a.fill_id.localeCompare(b.fill_id));
    } else if (table === "raw_swaps") {
      list.sort((a, b) => a.intent_hash.localeCompare(b.intent_hash) || a.tx_hash.localeCompare(b.tx_hash) || a.chain_id - b.chain_id);
    } else if (table === "token_metadata") {
      list.sort((a, b) => a.chain_id - b.chain_id || a.token_address.localeCompare(b.token_address));
    } else if (table === "metadata_queue") {
      list.sort((a, b) => a.chain_id - b.chain_id || a.token_address.localeCompare(b.token_address));
    }

    state[table] = JSON.parse(
      JSON.stringify(list, (key, value) => {
        if (key === "created_at" || key === "updated_at" || key === "block_timestamp" || key === "run_at") {
          return "PINNED_TIMESTAMP";
        }
        if (value && typeof value === 'object' && value.type === 'Buffer') {
          // Convert Buffer serialization to hex string for predictable diffs
          return "0x" + Buffer.from(value.data).toString("hex");
        }
        if (Buffer.isBuffer(value)) {
          return "0x" + value.toString("hex");
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
