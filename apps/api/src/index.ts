import { getDb } from "@sera/database";
import { logger } from "@sera/shared";
import {
  createBlockQueries,
  createDepositQueries,
  createWithdrawalQueries,
  createTradeQueries,
  createMetadataQueries,
} from "@sera/query";
import { buildApp } from "./app.js";

async function start() {
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

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  const host = process.env.HOST || "0.0.0.0";

  try {
    logger.info("Initializing reference HTTP API server...", { port, host });
    await app.listen({ port, host });
    logger.info(`Reference HTTP API server listening on http://${host}:${port}`);
  } catch (error) {
    logger.error("Failed to start Reference HTTP API server", { error: String(error) });
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test") {
  start().catch((err) => {
    logger.error("Fatal startup error", { error: String(err) });
    process.exit(1);
  });
}
