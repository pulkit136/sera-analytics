import { type Kysely, sql } from "kysely";

/**
 * Migration creating metadata_queue table for Layer 2 job orchestration.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("metadata_queue")
    .ifNotExists()
    .addColumn("chain_id", "integer", (col) => col.notNull())
    .addColumn("token_address", "varchar(42)", (col) => col.notNull())
    .addColumn("enrichment_type", "varchar(20)", (col) => col.notNull())
    .addColumn("status", "varchar(20)", (col) => col.notNull())
    .addColumn("attempt_count", "integer", (col) => col.notNull())
    .addColumn("run_at", "timestamptz", (col) => col.notNull())
    .addColumn("last_error", "text")
    .addColumn("block_number_observed", "bigint", (col) => col.notNull())
    .addPrimaryKeyConstraint("pk_metadata_queue", ["chain_id", "token_address"])
    .execute();

  // Add constraint for status states
  await sql`
    ALTER TABLE metadata_queue
    ADD CONSTRAINT chk_metadata_queue_status
    CHECK (status IN ('Pending', 'Failed', 'Dead'))
  `.execute(db);

  // Fast lookups for processing eligible queue tasks
  await db.schema
    .createIndex("idx_metadata_queue_pending")
    .ifNotExists()
    .on("metadata_queue")
    .columns(["status", "run_at"])
    .execute();
}

/**
 * Rollback metadata_queue table.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("metadata_queue").ifExists().execute();
}
