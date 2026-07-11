import type { ColumnType, Generated, Kysely, Transaction } from "kysely";

export interface TokensTable {
  token_address: string; // Primary Key
  symbol: string;
  decimals: number;
  is_whitelisted: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface MarketsTable {
  id: string; // Primary Key
  base_token_address: string;
  quote_token_address: string;
  min_trade_amount: string;
  price_tick_size: string;
  created_at: Generated<Date>;
}

export interface UsersTable {
  wallet_address: string; // Primary Key
  first_active_at: Date;
  last_active_at: Date;
  is_restricted: Generated<boolean>;
}

export interface DepositsTable {
  tx_hash: string; // Composite Primary Key
  log_index: number; // Composite Primary Key
  block_number: number;
  user_address: string;
  token_address: string;
  amount: string;
  amount_usd: number | null;
  block_timestamp: Date;
}

export interface WithdrawalsTable {
  tx_hash: string; // Composite Primary Key
  log_index: number; // Composite Primary Key
  block_number: number;
  user_address: string;
  token_address: string;
  amount: string;
  amount_usd: number | null;
  type: "standard" | "instant" | "emergency";
  status: "pending_timelock" | "executed" | "cancelled";
  request_block: number | null;
  block_timestamp: Date;
}

export interface TradesTable {
  trade_id: Generated<string>; // Primary Key
  tx_hash: string;
  block_number: number;
  order_hash_0: string;
  order_hash_1: string;
  user_0: string;
  user_1: string;
  token_0: string;
  token_1: string;
  match_amount_0: string;
  match_amount_1: string;
  price_0_to_1: string;
  volume_usd: string;
  gas_used: number | null;
  gas_price_gwei: string | null;
  block_timestamp: Date;
}

export interface SwapsTable {
  intent_hash: string; // Composite Primary Key
  tx_hash: string; // Composite Primary Key
  block_number: number;
  taker_address: string;
  input_token: string;
  output_token: string;
  input_amount: string;
  output_amount: string;
  volume_usd: string;
  routing_path: string; // JSON string
  fee_amount: string;
  fee_token: string;
  block_timestamp: Date;
}

export interface OrdersRawTable {
  order_hash: string; // Primary Key
  user_address: string;
  market_id: string;
  side: "buy" | "sell";
  price: string;
  amount: string;
  filled_amount: Generated<string>;
  status: "active" | "filled" | "partially_filled" | "cancelled" | "expired";
  is_virtual: Generated<boolean>;
  created_at: Date;
  updated_at: Date;
}

export interface OrderFillsTable {
  fill_id: Generated<string>; // Primary Key
  order_hash: string;
  trade_id: string;
  amount_filled: string;
  block_timestamp: Date;
}

export interface TokenPricesTable {
  token_address: string; // Composite Primary Key
  price_usd: string;
  timestamp: Date; // Composite Primary Key
}

export interface CheckpointsTable {
  indexer_name: string; // Primary Key
  chain_id: number;
  latest_indexed_block: number;
  updated_at: Date;
}

/**
 * Persisted block header information.
 *
 * `is_canonical` is the single source of truth for chain canonicality.
 * Protocol tables reference blocks via (chain_id, block_hash) and derive
 * canonicality by joining with this table.
 */
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
  tokens: TokensTable;
  markets: MarketsTable;
  users: UsersTable;
  deposits: DepositsTable;
  withdrawals: WithdrawalsTable;
  trades: TradesTable;
  swaps: SwapsTable;
  orders_raw: OrdersRawTable;
  order_fills: OrderFillsTable;
  token_prices: TokenPricesTable;
  checkpoints: CheckpointsTable;
  block_metadata: BlockMetadataTable;
  token_metadata: TokenMetadataTable;
  metadata_queue: MetadataQueueTable;
}

/**
 * DatabaseContext represents the common query execution context.
 * It can be either the primary database client or a Kysely transaction.
 */
export type DatabaseContext = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;
