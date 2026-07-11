import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("raw_order_fills")
    .addColumn("fill_id", "varchar(100)", (col) => col.primaryKey())
    .addColumn("tx_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("log_index", "integer", (col) => col.notNull())
    .addColumn("chain_id", "integer", (col) => col.notNull())
    .addColumn("block_number", "bigint", (col) => col.notNull())
    .addColumn("order_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("trade_id", "varchar(100)", (col) => col.notNull())
    .addColumn("amount_filled", sql`numeric(78,0)`, (col) => col.notNull())
    .addColumn("block_timestamp", "timestamptz", (col) => col.notNull())
    .addForeignKeyConstraint(
      "fk_raw_order_fills_trade",
      ["tx_hash", "log_index", "chain_id"],
      "raw_trades",
      ["tx_hash", "log_index", "chain_id"],
      (cb) => cb.onDelete("cascade")
    )
    .execute();

  await db.schema
    .createIndex("idx_raw_order_fills_order")
    .on("raw_order_fills")
    .column("order_hash")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("raw_order_fills").ifExists().execute();
}
