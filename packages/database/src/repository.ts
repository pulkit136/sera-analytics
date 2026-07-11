import type { NormalizedRecord } from "@sera/contracts";
import { PersistenceError } from "./errors.js";
import type { DatabaseContext } from "./schema.js";

/**
 * Result details returned after writing a batch of records.
 */
export interface PersistenceResult {
  inserted: NormalizedRecord[];
  updated: NormalizedRecord[];
  skipped: NormalizedRecord[];
  statistics: {
    insertedCount: number;
    updatedCount: number;
    skippedCount: number;
  };
}

/**
 * Repository boundary interface for storing normalized protocol records.
 */
export interface RecordRepository {
  /**
   * Persists a batch of normalized records atomically.
   *
   * @param db Shared DatabaseContext (connection pool or transaction instance).
   * @param records Collection of normalized records to save.
   * @throws {PersistenceError} If writing fails.
   */
  saveRecords(db: DatabaseContext, records: NormalizedRecord[]): Promise<PersistenceResult>;
}

/**
 * Kysely-based implementation of the RecordRepository.
 */
export class KyselyRecordRepository implements RecordRepository {
  /**
   * Persists normalized records directly to the database context.
   */
  public async saveRecords(
    db: DatabaseContext,
    records: NormalizedRecord[],
  ): Promise<PersistenceResult> {
    if (records.length === 0) {
      return {
        inserted: [],
        updated: [],
        skipped: [],
        statistics: { insertedCount: 0, updatedCount: 0, skippedCount: 0 },
      };
    }

    try {
      const result: PersistenceResult = {
        inserted: [],
        updated: [],
        skipped: [],
        statistics: { insertedCount: 0, updatedCount: 0, skippedCount: 0 },
      };

      // Group records to insert in order of reference dependency
      const deposits = records.filter((r) => r.recordType === "deposit");
      const withdrawals = records.filter((r) => r.recordType === "withdrawal");
      const trades = records.filter((r) => r.recordType === "trade");
      const fills = records.filter((r) => r.recordType === "order_fill");
      const swaps = records.filter((r) => r.recordType === "swap");

      // 1. Persist Deposits
      for (const d of deposits) {
        if (d.recordType !== "deposit") continue;
        const res = await db
          .insertInto("raw_deposits")
          .values({
            tx_hash: d.tx_hash,
            log_index: d.log_index,
            chain_id: d.chain_id!,
            block_number: d.block_number,
            block_hash: d.block_hash!,
            block_timestamp: new Date(),
            transaction_index: d.transaction_index!,
            user_address: d.user_address,
            token_address: d.token_address,
            amount: d.amount,
            raw_topics: d.raw_topics!,
            raw_data: Buffer.from(d.raw_data!.slice(2), "hex"),
          })
          .onConflict((oc) => oc.columns(["tx_hash", "log_index", "chain_id"]).doNothing())
          .returningAll()
          .executeTakeFirst();

        if (res) {
          result.inserted.push(d);
          result.statistics.insertedCount++;
        } else {
          result.skipped.push(d);
          result.statistics.skippedCount++;
        }
      }

      // 2. Persist Withdrawals
      for (const w of withdrawals) {
        if (w.recordType !== "withdrawal") continue;
        const res = await db
          .insertInto("raw_withdrawals")
          .values({
            tx_hash: w.tx_hash,
            log_index: w.log_index,
            chain_id: w.chain_id!,
            block_number: w.block_number,
            block_hash: w.block_hash!,
            block_timestamp: new Date(),
            transaction_index: w.transaction_index!,
            user_address: w.user_address,
            token_address: w.token_address,
            amount: w.amount,
            withdrawal_type: w.withdrawal_type,
            request_block: w.request_block,
            raw_topics: w.raw_topics!,
            raw_data: Buffer.from(w.raw_data!.slice(2), "hex"),
          })
          .onConflict((oc) => oc.columns(["tx_hash", "log_index", "chain_id"]).doNothing())
          .returningAll()
          .executeTakeFirst();

        if (res) {
          result.inserted.push(w);
          result.statistics.insertedCount++;
        } else {
          result.skipped.push(w);
          result.statistics.skippedCount++;
        }
      }

      // 3. Persist Trades
      for (const t of trades) {
        if (t.recordType !== "trade") continue;
        const res = await db
          .insertInto("raw_trades")
          .values({
            tx_hash: t.tx_hash,
            log_index: t.log_index,
            chain_id: t.chain_id!,
            block_number: t.block_number,
            block_hash: t.block_hash!,
            block_timestamp: new Date(),
            transaction_index: t.transaction_index!,
            order_hash_0: t.order_hash_0,
            order_hash_1: t.order_hash_1,
            user_0: t.user_0,
            user_1: t.user_1,
            token_0: t.token_0,
            token_1: t.token_1,
            amount_0: t.amount_0,
            amount_1: t.amount_1,
            protocol_take_0: t.protocol_take_0,
            protocol_take_1: t.protocol_take_1,
            raw_topics: t.raw_topics!,
            raw_data: Buffer.from(t.raw_data!.slice(2), "hex"),
            price_0_to_1: t.price_0_to_1,
          })
          .onConflict((oc) => oc.columns(["tx_hash", "log_index", "chain_id"]).doNothing())
          .returningAll()
          .executeTakeFirst();

        if (res) {
          result.inserted.push(t);
          result.statistics.insertedCount++;
        } else {
          result.skipped.push(t);
          result.statistics.skippedCount++;
        }
      }

      // 4. Persist Order Fills
      for (const f of fills) {
        if (f.recordType !== "order_fill") continue;
        const res = await db
          .insertInto("raw_order_fills")
          .values({
            fill_id: f.fill_id,
            tx_hash: f.tx_hash,
            log_index: f.log_index,
            chain_id: f.chain_id!,
            block_number: f.block_number,
            order_hash: f.order_hash,
            trade_id: f.trade_id,
            amount_filled: f.amount_filled,
            block_timestamp: new Date(),
          })
          .onConflict((oc) => oc.column("fill_id").doNothing())
          .returningAll()
          .executeTakeFirst();

        if (res) {
          result.inserted.push(f);
          result.statistics.insertedCount++;
        } else {
          result.skipped.push(f);
          result.statistics.skippedCount++;
        }
      }

      // 5. Persist Swaps
      for (const s of swaps) {
        if (s.recordType !== "swap") continue;
        const res = await db
          .insertInto("raw_swaps")
          .values({
            intent_hash: s.intent_hash,
            tx_hash: s.tx_hash,
            log_index: s.log_index,
            chain_id: s.chain_id!,
            block_number: s.block_number,
            block_hash: s.block_hash!,
            block_timestamp: new Date(),
            transaction_index: s.transaction_index!,
            taker_address: s.taker_address,
            leg_count: s.leg_count,
            raw_topics: s.raw_topics!,
            raw_data: Buffer.from(s.raw_data!.slice(2), "hex"),
          })
          .onConflict((oc) => oc.columns(["intent_hash", "tx_hash", "chain_id"]).doNothing())
          .returningAll()
          .executeTakeFirst();

        if (res) {
          result.inserted.push(s);
          result.statistics.insertedCount++;
        } else {
          result.skipped.push(s);
          result.statistics.skippedCount++;
        }
      }

      return result;
    } catch (error) {
      throw new PersistenceError("Database write execution failed", error);
    }
  }
}
