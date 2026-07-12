/**
 * Shared fixture helpers used across all integration test fixtures.
 *
 * These helpers construct valid EVM log entries that the real AbiEventDecoder
 * can decode. Every value is deterministic; no Math.random(), no Date.now().
 */

import { SERA_ABI, SERA_SOR_ABI, VAULT_ABI } from "@sera/contracts";
import { CONTRACT_ADDRESSES } from "@sera/contracts";
import type { BlockchainLog } from "@sera/contracts";
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters } from "viem";
import type { MockChain } from "../mocks/MockBlockchainReader.js";

// ---------------------------------------------------------------------------
// Deterministic addresses used across all fixtures
// ---------------------------------------------------------------------------

export const ADDRESSES = {
  TOKEN_USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as const,
  TOKEN_WBTC: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599" as const,
  USER_ALICE: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" as const,
  USER_BOB: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const,
};

export const CHAIN_ID = 1;
export const INDEXER_NAME = "integration-test-indexer";

// ---------------------------------------------------------------------------
// Log builders — use the real ABI encoders so AbiEventDecoder can parse them
// ---------------------------------------------------------------------------

export function buildDepositLog(opts: {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
  token: string;
  user: string;
  amount: bigint;
}): BlockchainLog {
  const topics = encodeEventTopics({
    abi: VAULT_ABI,
    eventName: "Deposited",
    args: { token: opts.token as `0x${string}`, user: opts.user as `0x${string}` },
  });
  const data = encodeAbiParameters(parseAbiParameters("uint256 amount"), [opts.amount]);

  return {
    address: CONTRACT_ADDRESSES.VAULT.toLowerCase(),
    topics: topics as string[],
    data,
    blockNumber: BigInt(opts.blockNumber),
    transactionHash: opts.txHash,
    transactionIndex: 0,
    logIndex: opts.logIndex,
    blockHash: opts.blockHash,
  };
}

export function buildOrderMatchedLog(opts: {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
  orderHash0: string;
  user0: string;
  token0: string;
  amount0: bigint;
  protocolTake0: bigint;
  orderHash1: string;
  user1: string;
  token1: string;
  amount1: bigint;
  protocolTake1: bigint;
}): BlockchainLog {
  const topics = encodeEventTopics({
    abi: SERA_ABI,
    eventName: "OrderMatched",
    args: {
      orderHash0: opts.orderHash0 as `0x${string}`,
      user0: opts.user0 as `0x${string}`,
      orderHash1: opts.orderHash1 as `0x${string}`,
    },
  });
  const data = encodeAbiParameters(
    parseAbiParameters(
      "address token0, uint256 amount0, uint256 protocolTake0, address user1, address token1, uint256 amount1, uint256 protocolTake1",
    ),
    [
      opts.token0 as `0x${string}`,
      opts.amount0,
      opts.protocolTake0,
      opts.user1 as `0x${string}`,
      opts.token1 as `0x${string}`,
      opts.amount1,
      opts.protocolTake1,
    ],
  );
  return {
    address: CONTRACT_ADDRESSES.SERA.toLowerCase(),
    topics: topics as string[],
    data,
    blockNumber: BigInt(opts.blockNumber),
    transactionHash: opts.txHash,
    transactionIndex: 0,
    logIndex: opts.logIndex,
    blockHash: opts.blockHash,
  };
}

export function buildIntentMatchedLog(opts: {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
  intentHash: string;
  taker: string;
  legCount: bigint;
}): BlockchainLog {
  const topics = encodeEventTopics({
    abi: SERA_SOR_ABI,
    eventName: "IntentMatched",
    args: {
      intentHash: opts.intentHash as `0x${string}`,
      taker: opts.taker as `0x${string}`,
    },
  });
  const data = encodeAbiParameters(parseAbiParameters("uint256 legCount"), [opts.legCount]);
  return {
    address: CONTRACT_ADDRESSES.SERA_SOR.toLowerCase(),
    topics: topics as string[],
    data,
    blockNumber: BigInt(opts.blockNumber),
    transactionHash: opts.txHash,
    transactionIndex: 0,
    logIndex: opts.logIndex,
    blockHash: opts.blockHash,
  };
}

/** A log whose topic does not match any ABI — will produce UnknownEvent. */
export function buildUnknownLog(opts: {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
}): BlockchainLog {
  return {
    address: CONTRACT_ADDRESSES.VAULT.toLowerCase(),
    topics: [`0x${"a".repeat(64)}`], // Random unrecognised topic
    data: "0x00",
    blockNumber: BigInt(opts.blockNumber),
    transactionHash: opts.txHash,
    transactionIndex: 0,
    logIndex: opts.logIndex,
    blockHash: opts.blockHash,
  };
}

// ---------------------------------------------------------------------------
// Simple chain builder
// ---------------------------------------------------------------------------

export function buildChain(
  blocks: Array<{
    blockNumber: number;
    blockHash: string;
    parentHash: string;
    logs: BlockchainLog[];
  }>,
): MockChain {
  return { blocks };
}
