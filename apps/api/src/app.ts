import Fastify from "fastify";
import type {
  BlockQueries,
  DepositQueries,
  WithdrawalQueries,
  TradeQueries,
  MetadataQueries,
} from "@sera/query";
import {
  isValidAddress,
  isValidHash,
  isValidNonNegativeInteger,
  isValidPositiveInteger,
} from "./validation.js";

export interface ApiDependencies {
  block: BlockQueries;
  deposit: DepositQueries;
  withdrawal: WithdrawalQueries;
  trade: TradeQueries;
  metadata: MetadataQueries;
}

export function buildApp(dependencies: ApiDependencies) {
  const app = Fastify({ logger: false });

  // Standardize unexpected internal server errors
  app.setErrorHandler((error, _request, reply) => {
    reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: error.message || "An unexpected internal server error occurred",
      },
    });
  });

  // GET /health
  app.get("/health", async (_request, reply) => {
    try {
      await dependencies.block.ping();
      return reply.status(200).send({
        status: "ok",
        service: "sera-api",
      });
    } catch (error) {
      return reply.status(503).send({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Database connection check failed",
        },
      });
    }
  });

  // GET /blocks/latest
  app.get("/blocks/latest", async (_request, reply) => {
    // Default chain ID to 1 as per system architecture
    const block = await dependencies.block.getLatestCanonicalBlock(1);
    if (!block) {
      return reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: "No canonical blocks found",
        },
      });
    }
    return reply.status(200).send(block);
  });

  // GET /blocks/:number
  app.get("/blocks/:number", async (request, reply) => {
    const { number } = request.params as { number: string };

    if (!isValidPositiveInteger(number)) {
      return reply.status(400).send({
        error: {
          code: "INVALID_PARAMETERS",
          message: "Block number must be a positive integer",
        },
      });
    }

    const block = await dependencies.block.getBlockByNumber(1, Number(number));
    if (!block) {
      return reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: `Block with number ${number} not found`,
        },
      });
    }
    return reply.status(200).send(block);
  });

  // GET /blocks/hash/:hash
  app.get("/blocks/hash/:hash", async (request, reply) => {
    const { hash } = request.params as { hash: string };

    if (!isValidHash(hash)) {
      return reply.status(400).send({
        error: {
          code: "INVALID_PARAMETERS",
          message: "Block hash must be a valid 32-byte hex string (0x prefixed)",
        },
      });
    }

    const block = await dependencies.block.getBlockByHash(1, hash);
    if (!block) {
      return reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: `Block with hash ${hash} not found`,
        },
      });
    }
    return reply.status(200).send(block);
  });

  // GET /deposits/:txHash/:logIndex
  app.get("/deposits/:txHash/:logIndex", async (request, reply) => {
    const { txHash, logIndex } = request.params as { txHash: string; logIndex: string };

    if (!isValidHash(txHash)) {
      return reply.status(400).send({
        error: {
          code: "INVALID_PARAMETERS",
          message: "Transaction hash must be a valid 32-byte hex string (0x prefixed)",
        },
      });
    }

    if (!isValidNonNegativeInteger(logIndex)) {
      return reply.status(400).send({
        error: {
          code: "INVALID_PARAMETERS",
          message: "Log index must be a non-negative integer",
        },
      });
    }

    const deposit = await dependencies.deposit.getDeposit(1, txHash, Number(logIndex));
    if (!deposit) {
      return reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: `Deposit not found for transaction ${txHash} and log index ${logIndex}`,
        },
      });
    }
    return reply.status(200).send(deposit);
  });

  // GET /accounts/:address/deposits
  app.get("/accounts/:address/deposits", async (request, reply) => {
    const { address } = request.params as { address: string };

    if (!isValidAddress(address)) {
      return reply.status(400).send({
        error: {
          code: "INVALID_PARAMETERS",
          message: "Account address must be a valid 20-byte hex string (0x prefixed)",
        },
      });
    }

    const deposits = await dependencies.deposit.listDepositsByUser(1, address);
    return reply.status(200).send(deposits);
  });

  // GET /accounts/:address/trades
  app.get("/accounts/:address/trades", async (request, reply) => {
    const { address } = request.params as { address: string };

    if (!isValidAddress(address)) {
      return reply.status(400).send({
        error: {
          code: "INVALID_PARAMETERS",
          message: "Account address must be a valid 20-byte hex string (0x prefixed)",
        },
      });
    }

    const trades = await dependencies.trade.listTradesByUser(1, address);
    return reply.status(200).send(trades);
  });

  // GET /tokens/:address
  app.get("/tokens/:address", async (request, reply) => {
    const { address } = request.params as { address: string };

    if (!isValidAddress(address)) {
      return reply.status(400).send({
        error: {
          code: "INVALID_PARAMETERS",
          message: "Token address must be a valid 20-byte hex string (0x prefixed)",
        },
      });
    }

    const token = await dependencies.metadata.getTokenMetadata(1, address);
    if (!token) {
      return reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: `Metadata not found for token address ${address}`,
        },
      });
    }
    return reply.status(200).send(token);
  });

  return app;
}
