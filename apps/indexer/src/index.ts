import { CONTRACT_ADDRESSES } from "@sera/contracts";
import { type DatabaseSchema, getDb } from "@sera/database";
import { getConfig, logger } from "@sera/shared";
import type { Kysely } from "kysely";
import { http, type PublicClient, createPublicClient } from "viem";
import { mainnet } from "viem/chains";

export * from "./pipeline.js";
export * from "./orchestrator.js";
export * from "./reorg.js";
export * from "./daemon.js";
export * from "./health.js";

export async function bootstrapIndexLoop(): Promise<{
  client: PublicClient;
  db: Kysely<DatabaseSchema>;
}> {
  const config = getConfig();
  logger.info("Initializing sera-data Indexer Service...", {
    env: config.NODE_ENV,
    logLevel: config.LOG_LEVEL,
    startBlock: config.START_BLOCK,
    confirmationDepth: config.RECONFIRMATION_DEPTH,
  });

  // Verify lazy database connection client
  const db = getDb();
  logger.info("Connected lazily to database repository.");

  // Initialize Viem public client using verified RPC parameters
  const client = createPublicClient({
    chain: mainnet,
    transport: http(config.RPC_URL),
  });

  logger.info("Created RPC connection client.", {
    rpcUrl: config.RPC_URL,
    vaultAddress: CONTRACT_ADDRESSES.VAULT,
    seraAddress: CONTRACT_ADDRESSES.SERA,
  });

  return { client, db };
}

// Auto-run if executed directly as entrypoint
if (process.env.NODE_ENV !== "test") {
  bootstrapIndexLoop().catch((err) => {
    logger.error("Failed to start indexer service loop", { error: String(err) });
    process.exit(1);
  });
}
