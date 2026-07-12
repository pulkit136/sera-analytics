import {
  CONTRACT_ADDRESSES,
  ViemBlockchainReader,
  AbiEventDecoder,
  DefaultEventNormalizer,
} from "@sera/contracts";
import {
  getDb,
  KyselyRecordRepository,
  PostgreSqlCheckpointStore,
  PostgreSqlBlockMetadataStore,
  type DatabaseSchema,
} from "@sera/database";
import { getConfig, logger, type Config } from "@sera/shared";
import type { Kysely } from "kysely";
import { http, createPublicClient, type PublicClient } from "viem";
import { mainnet } from "viem/chains";
import { IndexingPipeline } from "./pipeline.js";
import { ContinuousIndexer } from "./daemon.js";

export * from "./pipeline.js";
export * from "./orchestrator.js";
export * from "./reorg.js";
export * from "./daemon.js";
export * from "./health.js";

export async function bootstrapIndexLoop(): Promise<{
  client: PublicClient;
  db: Kysely<DatabaseSchema>;
  pipeline: IndexingPipeline;
  config: Config;
}> {
  const config = getConfig();

  const db = getDb();

  const client = createPublicClient({
    chain: mainnet,
    transport: http(config.RPC_URL),
  });

  const reader = new ViemBlockchainReader(client);
  const decoder = new AbiEventDecoder();
  const normalizer = new DefaultEventNormalizer();
  const repository = new KyselyRecordRepository();
  const checkpointStore = new PostgreSqlCheckpointStore();
  const blockMetadataStore = new PostgreSqlBlockMetadataStore();

  const pipeline = new IndexingPipeline(
    reader,
    decoder,
    normalizer,
    repository,
    checkpointStore,
    db as any,
    undefined,
    blockMetadataStore,
    { maxRollbackDepth: 100 },
  );

  return { client, db, pipeline, config };
}

async function start() {
  const { db, pipeline, config } = await bootstrapIndexLoop();

  const daemon = new ContinuousIndexer({
    pipeline,
    pipelineConfig: {
      startBlock: config.START_BLOCK,
      batchSize: 50,
      contractAddresses: [CONTRACT_ADDRESSES.VAULT, CONTRACT_ADDRESSES.SERA],
      indexerName: "sera-indexer",
      chainId: 1,
    },
    pollingIntervalMs: 5000,
    initialBackoffMs: 1000,
    maxBackoffMs: 30000,
    jitterFactor: 0.15,
    shutdownTimeoutMs: 10000,
    logger: logger as any,
  });

  logger.info("Starting Continuous Indexer Daemon...", {
    service: "sera-indexer",
    version: "1.0.0",
    nodeVersion: process.version,
    environment: config.NODE_ENV,
    startBlock: config.START_BLOCK,
    reconfirmationDepth: config.RECONFIRMATION_DEPTH,
  });

  daemon.start();

  // Graceful shutdown handling
  let isShuttingDown = false;
  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received signal ${signal} — initiating graceful shutdown.`, {
      service: "sera-indexer",
    });

    try {
      // stop() stops the indexing loop, awaiting active batch execution if any
      await daemon.stop();
      logger.info("ContinuousIndexer loop exited cleanly.");

      // Close Kysely database connection client context
      await db.destroy();
      logger.info("Database connection closed.");

      logger.info("Graceful shutdown complete. Exiting.", { status: 0 });
      process.exit(0);
    } catch (error) {
      logger.error("Error occurred during graceful shutdown", { error: String(error) });
      process.exit(1);
    }
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
}

// Auto-run if executed directly as entrypoint
if (process.env.NODE_ENV !== "test") {
  start().catch((err) => {
    logger.error("Failed to start indexer service loop", { error: String(err) });
    process.exit(1);
  });
}
