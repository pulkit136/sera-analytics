import type {
  MetadataRepository,
  MetadataSource,
  TokenIdentifier,
  TokenMetadata,
} from "@sera/metadata";
import { PersistenceError } from "./errors.js";
import type { DatabaseContext } from "./schema.js";

/**
 * PostgreSQL-backed implementation of MetadataRepository using Kysely.
 *
 * Implements clean 1-to-1 mapping between domain models and database rows,
 * and executes queries on the injected DatabaseContext.
 */
export class KyselyMetadataRepository implements MetadataRepository {
  /**
   * Idempotently persists a single token metadata record, replacing any existing snapshot.
   */
  public async upsert(db: DatabaseContext, metadata: TokenMetadata): Promise<void> {
    try {
      await db
        .insertInto("token_metadata")
        .values({
          chain_id: metadata.identifier.chainId,
          token_address: metadata.identifier.address.toLowerCase(),
          name: metadata.name,
          symbol: metadata.symbol,
          decimals: metadata.decimals,
          source: metadata.source,
          block_number_observed: metadata.blockNumberObserved,
        })
        .onConflict((oc) =>
          oc.columns(["chain_id", "token_address"]).doUpdateSet({
            name: metadata.name,
            symbol: metadata.symbol,
            decimals: metadata.decimals,
            source: metadata.source,
            block_number_observed: metadata.blockNumberObserved,
          }),
        )
        .execute();
    } catch (error) {
      throw new PersistenceError(
        `Failed to upsert token metadata for ${metadata.identifier.address} on chain ${metadata.identifier.chainId}`,
        error as Error,
      );
    }
  }

  /**
   * Idempotently persists a batch of metadata records atomically.
   */
  public async upsertMany(db: DatabaseContext, metadataList: TokenMetadata[]): Promise<void> {
    if (metadataList.length === 0) return;

    try {
      for (const metadata of metadataList) {
        await this.upsert(db, metadata);
      }
    } catch (error) {
      throw new PersistenceError(
        "Failed to upsert batch of token metadata records",
        error as Error,
      );
    }
  }

  /**
   * Retrieves the stored metadata snapshot for a token, or null if none exists.
   */
  public async find(db: DatabaseContext, token: TokenIdentifier): Promise<TokenMetadata | null> {
    try {
      const row = await db
        .selectFrom("token_metadata")
        .selectAll()
        .where("chain_id", "=", token.chainId)
        .where("token_address", "=", token.address.toLowerCase())
        .executeTakeFirst();

      if (!row) return null;

      // Reconstruct domain model from database row
      const symbol = row.symbol;
      const name = row.name;
      const decimals = row.decimals === null ? null : Number(row.decimals);
      const source = row.source as MetadataSource;
      const blockNumberObserved = Number(row.block_number_observed);

      const isComplete = symbol !== null && name !== null && decimals !== null;

      return {
        identifier: {
          chainId: row.chain_id,
          address: row.token_address,
        },
        symbol,
        name,
        decimals,
        logoUri: null,
        source,
        fetchedAt: new Date(0).toISOString(), // deterministic constant epoch
        isComplete,
        blockNumberObserved,
      };
    } catch (error) {
      throw new PersistenceError(
        `Failed to retrieve token metadata for ${token.address} on chain ${token.chainId}`,
        error as Error,
      );
    }
  }

  /**
   * Returns true if a metadata record exists for the given token.
   */
  public async exists(db: DatabaseContext, token: TokenIdentifier): Promise<boolean> {
    try {
      const row = await db
        .selectFrom("token_metadata")
        .select("token_address")
        .where("chain_id", "=", token.chainId)
        .where("token_address", "=", token.address.toLowerCase())
        .executeTakeFirst();

      return !!row;
    } catch (error) {
      throw new PersistenceError(
        `Failed to check existence of token metadata for ${token.address} on chain ${token.chainId}`,
        error as Error,
      );
    }
  }
}
