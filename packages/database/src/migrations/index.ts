import type { Migration } from "kysely";
import * as createLayer1Tables from "./20260711000000_create_layer1_tables.js";
import * as createCheckpointsTable from "./20260711000001_create_checkpoints_table.js";
import * as createBlockMetadata from "./20260711000002_create_block_metadata.js";
import * as createTokenMetadata from "./20260711000003_create_token_metadata.js";
import * as createMetadataQueue from "./20260711000004_create_metadata_queue.js";
import * as createRepositoryTables from "./20260711000005_create_repository_tables.js";

/**
 * Registry of all database schema migrations.
 */
export const migrations: Record<string, Migration> = {
  "20260711000000_create_layer1_tables": createLayer1Tables,
  "20260711000001_create_checkpoints_table": createCheckpointsTable,
  "20260711000002_create_block_metadata": createBlockMetadata,
  "20260711000003_create_token_metadata": createTokenMetadata,
  "20260711000004_create_metadata_queue": createMetadataQueue,
  "20260711000005_create_repository_tables": createRepositoryTables,
};
