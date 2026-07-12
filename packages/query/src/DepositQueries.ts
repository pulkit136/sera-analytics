import type { DatabaseContext } from "@sera/database";

export interface DepositRecord {
  tx_hash: string;
  log_index: number;
  chain_id: number;
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

export interface WithdrawalRecord {
  tx_hash: string;
  log_index: number;
  chain_id: number;
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

export interface DepositQueries {
  /**
   * Fetches a deposit by its transaction hash and log index on a specific chain.
   * Only returns the deposit if its block is canonical.
   */
  getDeposit(chainId: number, txHash: string, logIndex: number): Promise<DepositRecord | null>;

  /**
   * Lists deposits for a specific user on a chain, sorted newest first.
   * Only returns deposits in canonical blocks.
   */
  listDepositsByUser(chainId: number, userAddress: string): Promise<DepositRecord[]>;
}

export interface WithdrawalQueries {
  /**
   * Fetches a withdrawal by its transaction hash and log index on a specific chain.
   * Only returns the withdrawal if its block is canonical.
   */
  getWithdrawal(
    chainId: number,
    txHash: string,
    logIndex: number,
  ): Promise<WithdrawalRecord | null>;

  /**
   * Lists withdrawals for a specific user on a chain, sorted newest first.
   * Only returns withdrawals in canonical blocks.
   */
  listWithdrawalsByUser(chainId: number, userAddress: string): Promise<WithdrawalRecord[]>;
}

class KyselyDepositQueries implements DepositQueries {
  constructor(private readonly db: DatabaseContext) {}

  public async getDeposit(
    chainId: number,
    txHash: string,
    logIndex: number,
  ): Promise<DepositRecord | null> {
    const row = await this.db
      .selectFrom("raw_deposits")
      .innerJoin("block_metadata", (join) =>
        join
          .onRef("block_metadata.chain_id", "=", "raw_deposits.chain_id")
          .onRef("block_metadata.block_number", "=", "raw_deposits.block_number")
          .onRef("block_metadata.block_hash", "=", "raw_deposits.block_hash"),
      )
      .selectAll("raw_deposits")
      .where("raw_deposits.chain_id", "=", chainId)
      .where("raw_deposits.tx_hash", "=", txHash)
      .where("raw_deposits.log_index", "=", logIndex)
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
      user_address: row.user_address,
      token_address: row.token_address,
      amount: row.amount,
      raw_topics: row.raw_topics,
      raw_data: row.raw_data,
    };
  }

  public async listDepositsByUser(chainId: number, userAddress: string): Promise<DepositRecord[]> {
    const rows = await this.db
      .selectFrom("raw_deposits")
      .innerJoin("block_metadata", (join) =>
        join
          .onRef("block_metadata.chain_id", "=", "raw_deposits.chain_id")
          .onRef("block_metadata.block_number", "=", "raw_deposits.block_number")
          .onRef("block_metadata.block_hash", "=", "raw_deposits.block_hash"),
      )
      .selectAll("raw_deposits")
      .where("raw_deposits.chain_id", "=", chainId)
      .where("raw_deposits.user_address", "=", userAddress)
      .where("block_metadata.is_canonical", "=", true)
      .orderBy("raw_deposits.block_number", "desc")
      .orderBy("raw_deposits.transaction_index", "desc")
      .orderBy("raw_deposits.log_index", "desc")
      .execute();

    return rows.map((row) => ({
      tx_hash: row.tx_hash,
      log_index: row.log_index,
      chain_id: row.chain_id,
      block_number: Number(row.block_number),
      block_hash: row.block_hash,
      block_timestamp: row.block_timestamp,
      transaction_index: row.transaction_index,
      user_address: row.user_address,
      token_address: row.token_address,
      amount: row.amount,
      raw_topics: row.raw_topics,
      raw_data: row.raw_data,
    }));
  }
}

class KyselyWithdrawalQueries implements WithdrawalQueries {
  constructor(private readonly db: DatabaseContext) {}

  public async getWithdrawal(
    chainId: number,
    txHash: string,
    logIndex: number,
  ): Promise<WithdrawalRecord | null> {
    const row = await this.db
      .selectFrom("raw_withdrawals")
      .innerJoin("block_metadata", (join) =>
        join
          .onRef("block_metadata.chain_id", "=", "raw_withdrawals.chain_id")
          .onRef("block_metadata.block_number", "=", "raw_withdrawals.block_number")
          .onRef("block_metadata.block_hash", "=", "raw_withdrawals.block_hash"),
      )
      .selectAll("raw_withdrawals")
      .where("raw_withdrawals.chain_id", "=", chainId)
      .where("raw_withdrawals.tx_hash", "=", txHash)
      .where("raw_withdrawals.log_index", "=", logIndex)
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
      user_address: row.user_address,
      token_address: row.token_address,
      amount: row.amount,
      withdrawal_type: row.withdrawal_type,
      request_block: row.request_block !== null ? Number(row.request_block) : null,
      raw_topics: row.raw_topics,
      raw_data: row.raw_data,
    };
  }

  public async listWithdrawalsByUser(
    chainId: number,
    userAddress: string,
  ): Promise<WithdrawalRecord[]> {
    const rows = await this.db
      .selectFrom("raw_withdrawals")
      .innerJoin("block_metadata", (join) =>
        join
          .onRef("block_metadata.chain_id", "=", "raw_withdrawals.chain_id")
          .onRef("block_metadata.block_number", "=", "raw_withdrawals.block_number")
          .onRef("block_metadata.block_hash", "=", "raw_withdrawals.block_hash"),
      )
      .selectAll("raw_withdrawals")
      .where("raw_withdrawals.chain_id", "=", chainId)
      .where("raw_withdrawals.user_address", "=", userAddress)
      .where("block_metadata.is_canonical", "=", true)
      .orderBy("raw_withdrawals.block_number", "desc")
      .orderBy("raw_withdrawals.transaction_index", "desc")
      .orderBy("raw_withdrawals.log_index", "desc")
      .execute();

    return rows.map((row) => ({
      tx_hash: row.tx_hash,
      log_index: row.log_index,
      chain_id: row.chain_id,
      block_number: Number(row.block_number),
      block_hash: row.block_hash,
      block_timestamp: row.block_timestamp,
      transaction_index: row.transaction_index,
      user_address: row.user_address,
      token_address: row.token_address,
      amount: row.amount,
      withdrawal_type: row.withdrawal_type,
      request_block: row.request_block !== null ? Number(row.request_block) : null,
      raw_topics: row.raw_topics,
      raw_data: row.raw_data,
    }));
  }
}

export function createDepositQueries(db: DatabaseContext): DepositQueries {
  return new KyselyDepositQueries(db);
}

export function createWithdrawalQueries(db: DatabaseContext): WithdrawalQueries {
  return new KyselyWithdrawalQueries(db);
}
