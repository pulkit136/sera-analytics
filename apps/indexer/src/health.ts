import type { HealthCheck, HealthStatus } from "@sera/observability";
import type { CheckpointStore, DatabaseContext } from "@sera/database";
import type { PublicClient } from "viem";

/**
 * HealthCheck indicator for the ContinuousIndexer sync state and block progress.
 */
export class IndexerHealthCheck implements HealthCheck {
  public readonly name = "indexer";

  constructor(
    private readonly checkpointStore: CheckpointStore,
    private readonly db: DatabaseContext,
    private readonly client: PublicClient,
    private readonly indexerName: string,
    private readonly chainId: number,
  ) {}

  public async check(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();

    try {
      // 1. Fetch current indexer block height from the DB (returns number | null)
      const lastIndexedBlock = await this.checkpointStore.getCheckpoint(
        this.db,
        this.indexerName,
        this.chainId,
      );

      // 2. Fetch latest block number from the EVM network
      const chainBlock = await this.client.getBlockNumber();
      const latestChainBlock = Number(chainBlock);
      const indexedBlock = lastIndexedBlock ?? 0;
      const lag = latestChainBlock - indexedBlock;

      // Healthy if sync lag is within reasonable bounds (e.g. less than 1000 blocks)
      const isHealthy = lag < 1000;

      return {
        isHealthy,
        timestamp,
        details: {
          indexerName: this.indexerName,
          chainId: this.chainId,
          lastIndexedBlock: indexedBlock,
          latestChainBlock,
          syncLag: lag,
          status: lag === 0 ? "synchronized" : "syncing",
        },
      };
    } catch (error) {
      return {
        isHealthy: false,
        timestamp,
        details: {
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
