import { type Kysely, sql } from "kysely";

/**
 * Migration: Create token_metadata table.
 *
 * token_metadata stores deterministic Layer 2 token metadata snapshots
 * (name, symbol, decimals, source, block_number_observed).
 *
 * Primary Key: (chain_id, token_address)
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("token_metadata")
    .ifNotExists()
    .addColumn("chain_id", "integer", (col) => col.notNull())
    .addColumn("token_address", "varchar(42)", (col) => col.notNull())
    .addColumn("name", "varchar(255)")
    .addColumn("symbol", "varchar(50)")
    .addColumn("decimals", "integer")
    .addColumn("source", "varchar(50)", (col) => col.notNull())
    .addColumn("block_number_observed", "bigint", (col) => col.notNull())
    .addPrimaryKeyConstraint("token_metadata_pkey", ["chain_id", "token_address"])
    .execute();

  // Add constraint to restrict source to domain enum values
  await sql`
    ALTER TABLE token_metadata
    ADD CONSTRAINT chk_token_metadata_source
    CHECK (source IN ('OnChain', 'Registry', 'External', 'Unknown'))
  `.execute(db);

  // Fast lookups based on observing block height
  await db.schema
    .createIndex("idx_token_metadata_observed")
    .on("token_metadata")
    .columns(["chain_id", "block_number_observed"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_token_metadata_observed").ifExists().execute();
  await db.schema.dropTable("token_metadata").ifExists().execute();
}
