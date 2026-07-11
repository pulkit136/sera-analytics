import type { HealthCheck, HealthStatus } from "@sera/observability";
import type { PublicClient } from "viem";

/**
 * HealthCheck indicator for Viem RPC node connectivity.
 */
export class RpcHealthCheck implements HealthCheck {
  public readonly name = "rpc";

  constructor(private readonly client: PublicClient) {}

  public async check(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();

    try {
      // Fetch latest block number to verify RPC node connection
      const blockNumber = await this.client.getBlockNumber();

      return {
        isHealthy: true,
        timestamp,
        details: {
          status: "connected",
          latestBlock: Number(blockNumber),
        },
      };
    } catch (error) {
      return {
        isHealthy: false,
        timestamp,
        details: {
          status: "disconnected",
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
