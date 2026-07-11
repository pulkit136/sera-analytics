import type { ColumnType, Generated, Kysely, Transaction } from "kysely";

export interface RawDepositsTable {
  tx_hash: string; // Composite Primary Key
  log_index: number; // Composite Primary Key
  chain_id: number; // Composite Primary Key
  block_number: number;
  block_hash: string;
  block_timestamp: Date;
  transaction_index: number;
  user_address: string;
  token_address: string;
  amount: string;
  raw_topics: string[];
  raw_data: Buffer;
}

export interface RawWithdrawalsTable {
  tx_hash: string; // Composite Primary Key
  log_index: number; // Composite Primary Key
  chain_id: number; // Composite Primary Key
  block_number: number;
  block_hash: string;
  block_timestamp: Date;
  transaction_index: number;
  user_address: string;
  token_address: string;
  amount: string;
  withdrawal_type: string;
  request_block: number | null;
  raw_topics: string[];
  raw_data: Buffer;
}

export interface RawTradesTable {
  tx_hash: string; // Composite Primary Key
  log_index: number; // Composite Primary Key
  chain_id: number; // Composite Primary Key
  block_number: number;
  block_hash: string;
  block_timestamp: Date;
  transaction_index: number;
  order_hash_0: string;
  order_hash_1: string;
  user_0: string;
  user_1: string;
  token_0: string;
  token_1: string;
  amount_0: string;
  amount_1: string;
  protocol_take_0: string;
  protocol_take_1: string;
  raw_topics: string[];
  raw_data: Buffer;
  price_0_to_1: string;
}

export interface RawOrderFillsTable {
  fill_id: string; // Primary Key
  tx_hash: string;
  log_index: number;
  chain_id: number;
  block_number: number;
  order_hash: string;
  trade_id: string;
  amount_filled: string;
  block_timestamp: Date;
}

export interface RawSwapsTable {
  intent_hash: string; // Composite Primary Key
  tx_hash: string; // Composite Primary Key
  log_index: number;
  chain_id: number; // Composite Primary Key
  block_number: number;
  block_hash: string;
  block_timestamp: Date;
  transaction_index: number;
  taker_address: string;
  leg_count: number;
  raw_topics: string[];
  raw_data: Buffer;
}

export interface RawSwapLegsTable {
  tx_hash: string;
  log_index: number;
  chain_id: number; // Composite Primary Key
  block_number: number;
  block_hash: string;
  block_timestamp: Date;
  transaction_index: number;
  intent_hash: string; // Composite Primary Key
  leg_index: number; // Composite Primary Key
  taker_order_hash: string;
  maker_order_hash: string;
  raw_topics: string[];
  raw_data: Buffer;
}

export interface RawFailedMatchesTable {
  tx_hash: string; // Composite Primary Key
  log_index: number; // Composite Primary Key
  chain_id: number; // Composite Primary Key
  block_number: number;
  block_hash: string;
  block_timestamp: Date;
  transaction_index: number;
  order_hash_0: string;
  order_hash_1: string;
  reason: string;
  batch_index: number;
  raw_topics: string[];
  raw_data: Buffer;
}

export interface RawFailedIntentsTable {
  tx_hash: string; // Composite Primary Key
  log_index: number; // Composite Primary Key
  chain_id: number; // Composite Primary Key
  block_number: number;
  block_hash: string;
  block_timestamp: Date;
  transaction_index: number;
  intent_index: number;
  reason: string;
  raw_topics: string[];
  raw_data: Buffer;
}

export interface CheckpointsTable {
  indexer_name: string; // Primary Key
  chain_id: number;
  latest_indexed_block: number;
  updated_at: Date;
}

export interface BlockMetadataTable {
  chain_id: number; // Composite Primary Key
  block_number: number; // Composite Primary Key
  block_hash: string; // Composite Primary Key
  parent_block_hash: string;
  is_canonical: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface TokenMetadataTable {
  chain_id: number; // Composite Primary Key
  token_address: string; // Composite Primary Key
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  source: string;
  block_number_observed: number;
}

export interface MetadataQueueTable {
  chain_id: number; // Composite Primary Key
  token_address: string; // Composite Primary Key
  enrichment_type: string;
  status: string;
  attempt_count: number;
  run_at: Date;
  last_error: string | null;
  block_number_observed: number;
}

export interface DatabaseSchema {
  raw_deposits: RawDepositsTable;
  raw_withdrawals: RawWithdrawalsTable;
  raw_trades: RawTradesTable;
  raw_order_fills: RawOrderFillsTable;
  raw_swaps: RawSwapsTable;
  raw_swap_legs: RawSwapLegsTable;
  raw_failed_matches: RawFailedMatchesTable;
  raw_failed_intents: RawFailedIntentsTable;
  checkpoints: CheckpointsTable;
  block_metadata: BlockMetadataTable;
  token_metadata: TokenMetadataTable;
  metadata_queue: MetadataQueueTable;
}

export type DatabaseContext = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;
