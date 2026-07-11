import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // users
  await db.schema
    .createTable("users")
    .ifNotExists()
    .addColumn("wallet_address", "varchar(42)", (col) => col.primaryKey())
    .addColumn("first_active_at", "timestamptz", (col) => col.notNull())
    .addColumn("last_active_at", "timestamptz", (col) => col.notNull())
    .addColumn("is_restricted", "boolean", (col) => col.notNull().defaultTo(false))
    .execute();

  // deposits
  await db.schema
    .createTable("deposits")
    .ifNotExists()
    .addColumn("tx_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("log_index", "integer", (col) => col.notNull())
    .addColumn("block_number", "integer", (col) => col.notNull())
    .addColumn("user_address", "varchar(42)", (col) => col.notNull())
    .addColumn("token_address", "varchar(42)", (col) => col.notNull())
    .addColumn("amount", sql`numeric(78,0)`, (col) => col.notNull())
    .addColumn("amount_usd", "double precision")
    .addColumn("block_timestamp", "timestamptz", (col) => col.notNull())
    .addPrimaryKeyConstraint("pk_deposits", ["tx_hash", "log_index"])
    .execute();

  // withdrawals
  await db.schema
    .createTable("withdrawals")
    .ifNotExists()
    .addColumn("tx_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("log_index", "integer", (col) => col.notNull())
    .addColumn("block_number", "integer", (col) => col.notNull())
    .addColumn("user_address", "varchar(42)", (col) => col.notNull())
    .addColumn("token_address", "varchar(42)", (col) => col.notNull())
    .addColumn("amount", sql`numeric(78,0)`, (col) => col.notNull())
    .addColumn("amount_usd", "double precision")
    .addColumn("type", "varchar(20)", (col) => col.notNull()) // standard | instant | emergency
    .addColumn("status", "varchar(20)", (col) => col.notNull()) // pending_timelock | executed | cancelled
    .addColumn("request_block", "integer")
    .addColumn("block_timestamp", "timestamptz", (col) => col.notNull())
    .addPrimaryKeyConstraint("pk_withdrawals", ["tx_hash", "log_index"])
    .execute();

  // trades
  await db.schema
    .createTable("trades")
    .ifNotExists()
    .addColumn("trade_id", "varchar(100)", (col) => col.primaryKey())
    .addColumn("tx_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("block_number", "integer", (col) => col.notNull())
    .addColumn("order_hash_0", "varchar(66)", (col) => col.notNull())
    .addColumn("order_hash_1", "varchar(66)", (col) => col.notNull())
    .addColumn("user_0", "varchar(42)", (col) => col.notNull())
    .addColumn("user_1", "varchar(42)", (col) => col.notNull())
    .addColumn("token_0", "varchar(42)", (col) => col.notNull())
    .addColumn("token_1", "varchar(42)", (col) => col.notNull())
    .addColumn("match_amount_0", sql`numeric(78,0)`, (col) => col.notNull())
    .addColumn("match_amount_1", sql`numeric(78,0)`, (col) => col.notNull())
    .addColumn("price_0_to_1", sql`numeric(78,0)`, (col) => col.notNull())
    .addColumn("volume_usd", sql`numeric(78,0)`, (col) => col.notNull())
    .addColumn("gas_used", "integer")
    .addColumn("gas_price_gwei", sql`numeric(78,0)`)
    .addColumn("block_timestamp", "timestamptz", (col) => col.notNull())
    .execute();

  // order_fills
  await db.schema
    .createTable("order_fills")
    .ifNotExists()
    .addColumn("fill_id", "varchar(100)", (col) => col.primaryKey())
    .addColumn("order_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("trade_id", "varchar(100)", (col) => col.notNull())
    .addColumn("amount_filled", sql`numeric(78,0)`, (col) => col.notNull())
    .addColumn("block_timestamp", "timestamptz", (col) => col.notNull())
    .execute();

  // swaps
  await db.schema
    .createTable("swaps")
    .ifNotExists()
    .addColumn("intent_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("tx_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("block_number", "integer", (col) => col.notNull())
    .addColumn("taker_address", "varchar(42)", (col) => col.notNull())
    .addColumn("input_token", "varchar(42)", (col) => col.notNull())
    .addColumn("output_token", "varchar(42)", (col) => col.notNull())
    .addColumn("input_amount", sql`numeric(78,0)`, (col) => col.notNull())
    .addColumn("output_amount", sql`numeric(78,0)`, (col) => col.notNull())
    .addColumn("volume_usd", sql`numeric(78,0)`, (col) => col.notNull())
    .addColumn("routing_path", "text", (col) => col.notNull())
    .addColumn("fee_amount", sql`numeric(78,0)`, (col) => col.notNull())
    .addColumn("fee_token", "varchar(42)", (col) => col.notNull())
    .addColumn("block_timestamp", "timestamptz", (col) => col.notNull())
    .addPrimaryKeyConstraint("pk_swaps", ["intent_hash", "tx_hash"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("swaps").ifExists().execute();
  await db.schema.dropTable("order_fills").ifExists().execute();
  await db.schema.dropTable("trades").ifExists().execute();
  await db.schema.dropTable("withdrawals").ifExists().execute();
  await db.schema.dropTable("deposits").ifExists().execute();
  await db.schema.dropTable("users").ifExists().execute();
}
