import type { DatabaseContext } from "@sera/database";

export interface BlockMetadata {
  chainId: number;
  blockNumber: number;
  blockHash: string;
  parentBlockHash: string;
  isCanonical: boolean;
}

export interface BlockQueries {
  /**
   * Fetches a block by its hash on a specific chain.
   */
  getBlockByHash(chainId: number, blockHash: string): Promise<BlockMetadata | null>;

  /**
   * Fetches a block by its block number on a specific chain.
   */
  getBlockByNumber(chainId: number, blockNumber: number): Promise<BlockMetadata | null>;

  /**
   * Fetches the latest canonical block on a specific chain.
   */
  getLatestCanonicalBlock(chainId: number): Promise<BlockMetadata | null>;
}

class KyselyBlockQueries implements BlockQueries {
  constructor(private readonly db: DatabaseContext) {}

  public async getBlockByHash(chainId: number, blockHash: string): Promise<BlockMetadata | null> {
    const row = await this.db
      .selectFrom("block_metadata")
      .selectAll()
      .where("chain_id", "=", chainId)
      .where("block_hash", "=", blockHash)
      .executeTakeFirst();

    if (!row) return null;

    return {
      chainId: row.chain_id,
      blockNumber: Number(row.block_number),
      blockHash: row.block_hash,
      parentBlockHash: row.parent_block_hash,
      isCanonical: !!row.is_canonical,
    };
  }

  public async getBlockByNumber(chainId: number, blockNumber: number): Promise<BlockMetadata | null> {
    const row = await this.db
      .selectFrom("block_metadata")
      .selectAll()
      .where("chain_id", "=", chainId)
      .where("block_number", "=", blockNumber)
      .executeTakeFirst();

    if (!row) return null;

    return {
      chainId: row.chain_id,
      blockNumber: Number(row.block_number),
      blockHash: row.block_hash,
      parentBlockHash: row.parent_block_hash,
      isCanonical: !!row.is_canonical,
    };
  }

  public async getLatestCanonicalBlock(chainId: number): Promise<BlockMetadata | null> {
    const row = await this.db
      .selectFrom("block_metadata")
      .selectAll()
      .where("chain_id", "=", chainId)
      .where("is_canonical", "=", true)
      .orderBy("block_number", "desc")
      .limit(1)
      .executeTakeFirst();

    if (!row) return null;

    return {
      chainId: row.chain_id,
      blockNumber: Number(row.block_number),
      blockHash: row.block_hash,
      parentBlockHash: row.parent_block_hash,
      isCanonical: !!row.is_canonical,
    };
  }
}

/**
 * Factory function to create BlockQueries instance backed by Kysely.
 */
export function createBlockQueries(db: DatabaseContext): BlockQueries {
  return new KyselyBlockQueries(db);
}
