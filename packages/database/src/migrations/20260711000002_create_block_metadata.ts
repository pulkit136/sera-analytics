import { type Kysely, sql } from "kysely";

/**
 * Migration: Create block_metadata table.
 *
 * block_metadata is the single canonical authority for chain state.
 * is_canonical = TRUE means the block belongs to the current best chain.
 * is_canonical = FALSE means the block was part of an orphaned fork.
 *
 * Primary Key: (chain_id, block_number, block_hash) — allows storing both
 * the orphaned and the canonical block at the same height after a reorg.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("block_metadata")
    .ifNotExists()
    .addColumn("chain_id", "integer", (col) => col.notNull())
    .addColumn("block_number", "bigint", (col) => col.notNull())
    .addColumn("block_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("parent_block_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("is_canonical", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addPrimaryKeyConstraint("block_metadata_pkey", ["chain_id", "block_number", "block_hash"])
    .execute();

  // Fast lookup by (chain_id, block_hash) — used during reorg join on protocol tables.
  await db.schema
    .createIndex("block_metadata_chain_hash_canonical_idx")
    .on("block_metadata")
    .columns(["chain_id", "block_hash", "is_canonical"])
    .execute();

  // Fast retrieval of the latest canonical block per chain.
  await db.schema
    .createIndex("block_metadata_chain_number_idx")
    .on("block_metadata")
    .columns(["chain_id", "block_number"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("block_metadata_chain_number_idx").ifExists().execute();
  await db.schema.dropIndex("block_metadata_chain_hash_canonical_idx").ifExists().execute();
  await db.schema.dropTable("block_metadata").ifExists().execute();
}
