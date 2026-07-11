import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // raw_deposits
  await db.schema
    .createTable("raw_deposits")
    .addColumn("tx_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("log_index", "integer", (col) => col.notNull())
    .addColumn("chain_id", "integer", (col) => col.notNull())
    .addColumn("block_number", "bigint", (col) => col.notNull())
    .addColumn("block_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("block_timestamp", "timestamptz", (col) => col.notNull())
    .addColumn("transaction_index", "integer", (col) => col.notNull())
    .addColumn("user_address", "varchar(42)", (col) => col.notNull())
    .addColumn("token_address", "varchar(42)", (col) => col.notNull())
    .addColumn("amount", sql`numeric(78,0)`, (col) => col.notNull())
    .addColumn("raw_topics", sql`text[]`, (col) => col.notNull())
    .addColumn("raw_data", "bytea", (col) => col.notNull())
    .addPrimaryKeyConstraint("pk_raw_deposits", ["tx_hash", "log_index", "chain_id"])
    .execute();

  await db.schema
    .createIndex("idx_raw_deposits_user")
    .on("raw_deposits")
    .column("user_address")
    .execute();
  await db.schema
    .createIndex("idx_raw_deposits_token")
    .on("raw_deposits")
    .column("token_address")
    .execute();

  // raw_withdrawals
  await db.schema
    .createTable("raw_withdrawals")
    .addColumn("tx_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("log_index", "integer", (col) => col.notNull())
    .addColumn("chain_id", "integer", (col) => col.notNull())
    .addColumn("block_number", "bigint", (col) => col.notNull())
    .addColumn("block_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("block_timestamp", "timestamptz", (col) => col.notNull())
    .addColumn("transaction_index", "integer", (col) => col.notNull())
    .addColumn("user_address", "varchar(42)", (col) => col.notNull())
    .addColumn("token_address", "varchar(42)", (col) => col.notNull())
    .addColumn("amount", sql`numeric(78,0)`, (col) => col.notNull())
    .addColumn("withdrawal_type", "varchar(20)", (col) => col.notNull())
    .addColumn("request_block", "bigint")
    .addColumn("raw_topics", sql`text[]`, (col) => col.notNull())
    .addColumn("raw_data", "bytea", (col) => col.notNull())
    .addPrimaryKeyConstraint("pk_raw_withdrawals", ["tx_hash", "log_index", "chain_id"])
    .execute();

  await db.schema
    .createIndex("idx_raw_withdrawals_user")
    .on("raw_withdrawals")
    .column("user_address")
    .execute();
  await db.schema
    .createIndex("idx_raw_withdrawals_token")
    .on("raw_withdrawals")
    .column("token_address")
    .execute();

  // raw_trades
  await db.schema
    .createTable("raw_trades")
    .addColumn("tx_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("log_index", "integer", (col) => col.notNull())
    .addColumn("chain_id", "integer", (col) => col.notNull())
    .addColumn("block_number", "bigint", (col) => col.notNull())
    .addColumn("block_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("block_timestamp", "timestamptz", (col) => col.notNull())
    .addColumn("transaction_index", "integer", (col) => col.notNull())
    .addColumn("order_hash_0", "varchar(66)", (col) => col.notNull())
    .addColumn("order_hash_1", "varchar(66)", (col) => col.notNull())
    .addColumn("user_0", "varchar(42)", (col) => col.notNull())
    .addColumn("user_1", "varchar(42)", (col) => col.notNull())
    .addColumn("token_0", "varchar(42)", (col) => col.notNull())
    .addColumn("token_1", "varchar(42)", (col) => col.notNull())
    .addColumn("amount_0", sql`numeric(78,0)`, (col) => col.notNull())
    .addColumn("amount_1", sql`numeric(78,0)`, (col) => col.notNull())
    .addColumn("protocol_take_0", sql`numeric(78,0)`, (col) => col.notNull())
    .addColumn("protocol_take_1", sql`numeric(78,0)`, (col) => col.notNull())
    .addColumn("raw_topics", sql`text[]`, (col) => col.notNull())
    .addColumn("raw_data", "bytea", (col) => col.notNull())
    .addPrimaryKeyConstraint("pk_raw_trades", ["tx_hash", "log_index", "chain_id"])
    .execute();

  await db.schema.createIndex("idx_raw_trades_user_0").on("raw_trades").column("user_0").execute();
  await db.schema.createIndex("idx_raw_trades_user_1").on("raw_trades").column("user_1").execute();

  // raw_swaps
  await db.schema
    .createTable("raw_swaps")
    .addColumn("intent_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("tx_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("log_index", "integer", (col) => col.notNull())
    .addColumn("chain_id", "integer", (col) => col.notNull())
    .addColumn("block_number", "bigint", (col) => col.notNull())
    .addColumn("block_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("block_timestamp", "timestamptz", (col) => col.notNull())
    .addColumn("transaction_index", "integer", (col) => col.notNull())
    .addColumn("taker_address", "varchar(42)", (col) => col.notNull())
    .addColumn("leg_count", "integer", (col) => col.notNull())
    .addColumn("raw_topics", sql`text[]`, (col) => col.notNull())
    .addColumn("raw_data", "bytea", (col) => col.notNull())
    .addPrimaryKeyConstraint("pk_raw_swaps", ["intent_hash", "tx_hash", "chain_id"])
    .execute();

  await db.schema
    .createIndex("idx_raw_swaps_taker")
    .on("raw_swaps")
    .column("taker_address")
    .execute();

  // raw_swap_legs
  await db.schema
    .createTable("raw_swap_legs")
    .addColumn("tx_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("log_index", "integer", (col) => col.notNull())
    .addColumn("chain_id", "integer", (col) => col.notNull())
    .addColumn("block_number", "bigint", (col) => col.notNull())
    .addColumn("block_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("block_timestamp", "timestamptz", (col) => col.notNull())
    .addColumn("transaction_index", "integer", (col) => col.notNull())
    .addColumn("intent_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("leg_index", "integer", (col) => col.notNull())
    .addColumn("taker_order_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("maker_order_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("raw_topics", sql`text[]`, (col) => col.notNull())
    .addColumn("raw_data", "bytea", (col) => col.notNull())
    .addPrimaryKeyConstraint("pk_raw_swap_legs", ["intent_hash", "leg_index", "chain_id"])
    .execute();

  await db.schema
    .createIndex("idx_raw_swap_legs_intent")
    .on("raw_swap_legs")
    .column("intent_hash")
    .execute();

  // raw_failed_matches
  await db.schema
    .createTable("raw_failed_matches")
    .addColumn("tx_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("log_index", "integer", (col) => col.notNull())
    .addColumn("chain_id", "integer", (col) => col.notNull())
    .addColumn("block_number", "bigint", (col) => col.notNull())
    .addColumn("block_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("block_timestamp", "timestamptz", (col) => col.notNull())
    .addColumn("transaction_index", "integer", (col) => col.notNull())
    .addColumn("order_hash_0", "varchar(66)", (col) => col.notNull())
    .addColumn("order_hash_1", "varchar(66)", (col) => col.notNull())
    .addColumn("reason", "text", (col) => col.notNull())
    .addColumn("batch_index", "integer", (col) => col.notNull())
    .addColumn("raw_topics", sql`text[]`, (col) => col.notNull())
    .addColumn("raw_data", "bytea", (col) => col.notNull())
    .addPrimaryKeyConstraint("pk_raw_failed_matches", ["tx_hash", "log_index", "chain_id"])
    .execute();

  // raw_failed_intents
  await db.schema
    .createTable("raw_failed_intents")
    .addColumn("tx_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("log_index", "integer", (col) => col.notNull())
    .addColumn("chain_id", "integer", (col) => col.notNull())
    .addColumn("block_number", "bigint", (col) => col.notNull())
    .addColumn("block_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("block_timestamp", "timestamptz", (col) => col.notNull())
    .addColumn("transaction_index", "integer", (col) => col.notNull())
    .addColumn("intent_index", "integer", (col) => col.notNull())
    .addColumn("reason", "text", (col) => col.notNull())
    .addColumn("raw_topics", sql`text[]`, (col) => col.notNull())
    .addColumn("raw_data", "bytea", (col) => col.notNull())
    .addPrimaryKeyConstraint("pk_raw_failed_intents", ["tx_hash", "log_index", "chain_id"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("raw_failed_intents").ifExists().execute();
  await db.schema.dropTable("raw_failed_matches").ifExists().execute();
  await db.schema.dropTable("raw_swap_legs").ifExists().execute();
  await db.schema.dropTable("raw_swaps").ifExists().execute();
  await db.schema.dropTable("raw_trades").ifExists().execute();
  await db.schema.dropTable("raw_withdrawals").ifExists().execute();
  await db.schema.dropTable("raw_deposits").ifExists().execute();
}
