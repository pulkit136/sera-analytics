import type { DatabaseContext } from "@sera/database";

export interface TradeRecord {
  tx_hash: string;
  log_index: number;
  chain_id: number;
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
  trade_id: string;
}

export interface TradeQueries {
  /**
   * Fetches a trade by its transaction hash and log index on a specific chain.
   * Only returns the trade if its block is canonical.
   */
  getTrade(chainId: number, txHash: string, logIndex: number): Promise<TradeRecord | null>;

  /**
   * Lists all trades involving a user (either user_0 or user_1) on a chain, sorted newest first.
   * Only returns trades in canonical blocks.
   */
  listTradesByUser(chainId: number, userAddress: string): Promise<TradeRecord[]>;
}

class KyselyTradeQueries implements TradeQueries {
  constructor(private readonly db: DatabaseContext) {}

  public async getTrade(
    chainId: number,
    txHash: string,
    logIndex: number,
  ): Promise<TradeRecord | null> {
    const row = await this.db
      .selectFrom("raw_trades")
      .innerJoin("block_metadata", (join) =>
        join
          .onRef("block_metadata.chain_id", "=", "raw_trades.chain_id")
          .onRef("block_metadata.block_number", "=", "raw_trades.block_number")
          .onRef("block_metadata.block_hash", "=", "raw_trades.block_hash"),
      )
      .selectAll("raw_trades")
      .where("raw_trades.chain_id", "=", chainId)
      .where("raw_trades.tx_hash", "=", txHash)
      .where("raw_trades.log_index", "=", logIndex)
      .where("block_metadata.is_canonical", "=", true)
      .executeTakeFirst();

    if (!row) return null;

    return {
      tx_hash: row.tx_hash,
      log_index: row.log_index,
      chain_id: row.chain_id,
      block_number: Number(row.block_number),
      block_hash: row.block_hash,
      block_timestamp: row.block_timestamp,
      transaction_index: row.transaction_index,
      order_hash_0: row.order_hash_0,
      order_hash_1: row.order_hash_1,
      user_0: row.user_0,
      user_1: row.user_1,
      token_0: row.token_0,
      token_1: row.token_1,
      amount_0: row.amount_0,
      amount_1: row.amount_1,
      protocol_take_0: row.protocol_take_0,
      protocol_take_1: row.protocol_take_1,
      raw_topics: row.raw_topics,
      raw_data: row.raw_data,
      price_0_to_1: row.price_0_to_1,
      trade_id: `${row.tx_hash}_${row.log_index}`,
    };
  }

  public async listTradesByUser(chainId: number, userAddress: string): Promise<TradeRecord[]> {
    const rows = await this.db
      .selectFrom("raw_trades")
      .innerJoin("block_metadata", (join) =>
        join
          .onRef("block_metadata.chain_id", "=", "raw_trades.chain_id")
          .onRef("block_metadata.block_number", "=", "raw_trades.block_number")
          .onRef("block_metadata.block_hash", "=", "raw_trades.block_hash"),
      )
      .selectAll("raw_trades")
      .where("raw_trades.chain_id", "=", chainId)
      .where((eb) =>
        eb.or([
          eb("raw_trades.user_0", "=", userAddress),
          eb("raw_trades.user_1", "=", userAddress),
        ]),
      )
      .where("block_metadata.is_canonical", "=", true)
      .orderBy("raw_trades.block_number", "desc")
      .orderBy("raw_trades.transaction_index", "desc")
      .orderBy("raw_trades.log_index", "desc")
      .execute();

    return rows.map((row) => ({
      tx_hash: row.tx_hash,
      log_index: row.log_index,
      chain_id: row.chain_id,
      block_number: Number(row.block_number),
      block_hash: row.block_hash,
      block_timestamp: row.block_timestamp,
      transaction_index: row.transaction_index,
      order_hash_0: row.order_hash_0,
      order_hash_1: row.order_hash_1,
      user_0: row.user_0,
      user_1: row.user_1,
      token_0: row.token_0,
      token_1: row.token_1,
      amount_0: row.amount_0,
      amount_1: row.amount_1,
      protocol_take_0: row.protocol_take_0,
      protocol_take_1: row.protocol_take_1,
      raw_topics: row.raw_topics,
      raw_data: row.raw_data,
      price_0_to_1: row.price_0_to_1,
      trade_id: `${row.tx_hash}_${row.log_index}`,
    }));
  }
}

export function createTradeQueries(db: DatabaseContext): TradeQueries {
  return new KyselyTradeQueries(db);
}
