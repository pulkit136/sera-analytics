import type { DatabaseContext } from "@sera/database";

export interface TokenMetadata {
  chainId: number;
  tokenAddress: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  source: string;
  blockNumberObserved: number;
}

export interface MetadataQueries {
  /**
   * Fetches metadata for a specific token on a chain.
   */
  getTokenMetadata(chainId: number, tokenAddress: string): Promise<TokenMetadata | null>;
}

class KyselyMetadataQueries implements MetadataQueries {
  constructor(private readonly db: DatabaseContext) {}

  public async getTokenMetadata(chainId: number, tokenAddress: string): Promise<TokenMetadata | null> {
    const row = await this.db
      .selectFrom("token_metadata")
      .selectAll()
      .where("chain_id", "=", chainId)
      .where("token_address", "=", tokenAddress)
      .executeTakeFirst();

    if (!row) return null;

    return {
      chainId: row.chain_id,
      tokenAddress: row.token_address,
      name: row.name,
      symbol: row.symbol,
      decimals: row.decimals !== null ? Number(row.decimals) : null,
      source: row.source,
      blockNumberObserved: Number(row.block_number_observed),
    };
  }
}

export function createMetadataQueries(db: DatabaseContext): MetadataQueries {
  return new KyselyMetadataQueries(db);
}
