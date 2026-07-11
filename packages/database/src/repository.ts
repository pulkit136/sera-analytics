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
      const users = records.filter((r) => r.recordType === "user");
      const deposits = records.filter((r) => r.recordType === "deposit");
      const withdrawals = records.filter((r) => r.recordType === "withdrawal");
      const trades = records.filter((r) => r.recordType === "trade");
      const fills = records.filter((r) => r.recordType === "order_fill");
      const swaps = records.filter((r) => r.recordType === "swap");

      // 1. Persist Users
      for (const u of users) {
        if (u.recordType !== "user") continue;
        const res = await db
          .insertInto("users")
          .values({
            wallet_address: u.wallet_address,
            first_active_at: new Date(),
            last_active_at: new Date(),
          })
          .onConflict((oc) =>
            oc.column("wallet_address").doUpdateSet({
              last_active_at: new Date(),
            }),
          )
          .returningAll()
          .executeTakeFirst();

        if (res) {
          result.inserted.push(u);
          result.statistics.insertedCount++;
        }
      }

      // 2. Persist Deposits
      for (const d of deposits) {
        if (d.recordType !== "deposit") continue;
        const res = await db
          .insertInto("deposits")
          .values({
            tx_hash: d.tx_hash,
            log_index: d.log_index,
            block_number: d.block_number,
            user_address: d.user_address,
            token_address: d.token_address,
            amount: d.amount,
            block_timestamp: new Date(),
          })
          .onConflict((oc) => oc.columns(["tx_hash", "log_index"]).doNothing())
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

      // 3. Persist Withdrawals
      for (const w of withdrawals) {
        if (w.recordType !== "withdrawal") continue;
        const res = await db
          .insertInto("withdrawals")
          .values({
            tx_hash: w.tx_hash,
            log_index: w.log_index,
            block_number: w.block_number,
            user_address: w.user_address,
            token_address: w.token_address,
            amount: w.amount,
            type: w.withdrawal_type,
            status: w.status,
            request_block: w.request_block,
            block_timestamp: new Date(),
          })
          .onConflict((oc) =>
            oc.columns(["tx_hash", "log_index"]).doUpdateSet({
              status: w.status,
              block_timestamp: new Date(),
            }),
          )
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

      // 4. Persist Trades
      for (const t of trades) {
        if (t.recordType !== "trade") continue;
        const res = await db
          .insertInto("trades")
          .values({
            trade_id: t.trade_id,
            tx_hash: t.tx_hash,
            block_number: t.block_number,
            order_hash_0: t.order_hash_0,
            order_hash_1: t.order_hash_1,
            user_0: t.user_0,
            user_1: t.user_1,
            token_0: t.token_0,
            token_1: t.token_1,
            match_amount_0: t.match_amount_0,
            match_amount_1: t.match_amount_1,
            price_0_to_1: t.price_0_to_1,
            volume_usd: "0",
            block_timestamp: new Date(),
          })
          .onConflict((oc) => oc.column("trade_id").doNothing())
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

      // 5. Persist Order Fills
      for (const f of fills) {
        if (f.recordType !== "order_fill") continue;
        const res = await db
          .insertInto("order_fills")
          .values({
            fill_id: f.fill_id,
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

      // 6. Persist Swaps
      for (const s of swaps) {
        if (s.recordType !== "swap") continue;
        const res = await db
          .insertInto("swaps")
          .values({
            intent_hash: s.intent_hash,
            tx_hash: s.tx_hash,
            block_number: s.block_number,
            taker_address: s.taker_address,
            input_token: s.input_token,
            output_token: s.output_token,
            input_amount: s.input_amount,
            output_amount: s.output_amount,
            volume_usd: "0",
            routing_path: s.routing_path,
            fee_amount: s.fee_amount,
            fee_token: s.fee_token,
            block_timestamp: new Date(),
          })
          .onConflict((oc) => oc.columns(["intent_hash", "tx_hash"]).doNothing())
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
