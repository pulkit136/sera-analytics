import { getDb } from "@sera/database";
import {
  createBlockQueries,
  createDepositQueries,
  createMetadataQueries,
  createTradeQueries,
  createWithdrawalQueries,
} from "@sera/query";
import { getConfig, logger } from "@sera/shared";
import { buildApp } from "./app.js";

async function start() {
  // Fail-fast environment configuration validation
  const config = getConfig();

  const db = getDb();

  // Initialize Kysely-backed implementations of the query layer
  const dependencies = {
    block: createBlockQueries(db),
    deposit: createDepositQueries(db),
    withdrawal: createWithdrawalQueries(db),
    trade: createTradeQueries(db),
    metadata: createMetadataQueries(db),
  };

  const app = buildApp(dependencies);

  const port = config.PORT;
  const host = process.env.HOST || "0.0.0.0";

  // Startup logs conforming to operational specifications
  logger.info("Starting Reference HTTP API...", {
    service: "sera-api",
    version: "1.0.0",
    nodeVersion: process.version,
    environment: config.NODE_ENV,
    port,
    host,
  });

  try {
    await app.listen({ port, host });
    logger.info(`Reference HTTP API listening on http://${host}:${port}`);
  } catch (error) {
    logger.error("Failed to start Reference HTTP API server", { error: String(error) });
    process.exit(1);
  }

  // Graceful shutdown handling
  let isShuttingDown = false;
  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received signal ${signal} — initiating graceful shutdown.`, {
      service: "sera-api",
    });

    try {
      // Fastify app.close() stops accepting new requests and finishes in-flight requests
      await app.close();
      logger.info("Fastify HTTP server closed.");

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

if (process.env.NODE_ENV !== "test") {
  start().catch((err) => {
    logger.error("Fatal startup error", { error: String(err) });
    process.exit(1);
  });
}
