import { type Abi, decodeEventLog } from "viem";
import { SERA_ABI, SERA_BATCHER_ABI, SERA_SOR_ABI, VAULT_ABI } from "./abis.js";
import { CONTRACT_ADDRESSES } from "./addresses.js";
import { DecoderError } from "./errors.js";
import type { BlockchainLog } from "./reader.js";

/**
 * Common metadata attributes present in all decoded protocol events.
 */
export interface BaseEvent {
  contractAddress: string;
  blockNumber: bigint;
  transactionHash: string;
  logIndex: number;
  topics: string[];
  data: string;
  blockHash: string;
  transactionIndex: number;
  chainId: number;
}

export interface DepositedEvent extends BaseEvent {
  type: "Deposited";
  args: {
    token: string;
    user: string;
    amount: bigint;
  };
}

export interface WithdrawnEvent extends BaseEvent {
  type: "Withdrawn";
  args: {
    token: string;
    user: string;
    amount: bigint;
  };
}

export interface OrderMatchedEvent extends BaseEvent {
  type: "OrderMatched";
  args: {
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
  };
}

export interface InstantWithdrawEvent extends BaseEvent {
  type: "InstantWithdraw";
  args: {
    user: string;
    uuid: bigint;
    token: string;
    amount: bigint;
    recipient: string;
  };
}

export interface WithdrawRequestedEvent extends BaseEvent {
  type: "WithdrawRequested";
  args: {
    user: string;
    token: string;
    amount: bigint;
    requestBlock: bigint;
  };
}

export interface WithdrawEvent extends BaseEvent {
  type: "Withdraw";
  args: {
    token: string;
    to: string;
    amount: bigint;
  };
}

export interface IntentMatchedEvent extends BaseEvent {
  type: "IntentMatched";
  args: {
    intentHash: string;
    taker: string;
    legCount: bigint;
  };
}

export interface IntentLegMatchedEvent extends BaseEvent {
  type: "IntentLegMatched";
  args: {
    intentHash: string;
    legIndex: bigint;
    takerOrderHash: string;
    makerOrderHash: string;
  };
}

export interface BatchExecutedEvent extends BaseEvent {
  type: "BatchExecuted";
  args: {
    attempted: bigint;
    failedMask: bigint;
  };
}

export interface MatchFailedEvent extends BaseEvent {
  type: "MatchFailed";
  args: {
    orderHash0: string;
    orderHash1: string;
    reason: string;
    batchIndex: bigint;
  };
}

export interface AtomicBatchExecutedEvent extends BaseEvent {
  type: "AtomicBatchExecuted";
  args: {
    matchCount: bigint;
  };
}

export interface AtomicBatchFailedEvent extends BaseEvent {
  type: "AtomicBatchFailed";
  args: {
    batchIndex: bigint;
    reason: string;
  };
}

export interface IntentFailedEvent extends BaseEvent {
  type: "IntentFailed";
  args: {
    intentIndex: bigint;
    reason: string;
  };
}

export interface UnknownEvent extends BaseEvent {
  type: "UnknownEvent";
  args: Record<string, never>;
}

export type SeraEvent =
  | DepositedEvent
  | WithdrawnEvent
  | OrderMatchedEvent
  | InstantWithdrawEvent
  | WithdrawRequestedEvent
  | WithdrawEvent
  | IntentMatchedEvent
  | IntentLegMatchedEvent
  | BatchExecutedEvent
  | MatchFailedEvent
  | AtomicBatchExecutedEvent
  | AtomicBatchFailedEvent
  | IntentFailedEvent
  | UnknownEvent;

/**
 * Map of contract addresses to their respective type-safe ABI profiles.
 */
const ABI_MAP: Record<string, Abi> = {
  [CONTRACT_ADDRESSES.VAULT.toLowerCase()]: VAULT_ABI,
  [CONTRACT_ADDRESSES.SERA.toLowerCase()]: SERA_ABI,
  [CONTRACT_ADDRESSES.SERA_SOR.toLowerCase()]: SERA_SOR_ABI,
  [CONTRACT_ADDRESSES.SERA_BATCHER.toLowerCase()]: SERA_BATCHER_ABI,
};

/**
 * Interface representing the decoder boundary.
 */
export interface EventDecoder {
  /**
   * Translates a raw EVM log into a discriminated union type-safe protocol event.
   *
   * @param log The raw log retrieved from the blockchain node.
   * @param chainId Optional chain identifier.
   * @throws {DecoderError} If the decoder encounters unexpected internal failures.
   */
  decode(log: BlockchainLog, chainId?: number): SeraEvent;
}

/**
 * AbiEventDecoder converts blockchain logs using the compiled Sera contract ABIs.
 */
export class AbiEventDecoder implements EventDecoder {
  /**
   * Decodes a raw blockchain log into a strongly typed event representation.
   */
  public decode(log: BlockchainLog, chainId?: number): SeraEvent {
    try {
      if (!log) {
        throw new DecoderError("BlockchainLog input parameter cannot be null or undefined");
      }

      const {
        address,
        topics,
        data,
        blockNumber,
        transactionHash,
        logIndex,
        blockHash,
        transactionIndex,
      } = log;
      const base: BaseEvent = {
        contractAddress: address.toLowerCase(),
        blockNumber,
        transactionHash,
        logIndex,
        topics,
        data,
        blockHash,
        transactionIndex,
        chainId: chainId ?? 0,
      };

      if (!topics || topics.length === 0) {
        return { type: "UnknownEvent", ...base, args: {} };
      }

      const targetAbi = ABI_MAP[address.toLowerCase()];
      if (targetAbi) {
        try {
          const decoded = decodeEventLog({
            abi: targetAbi,
            data: data as `0x${string}`,
            topics: topics as [`0x${string}`, ...`0x${string}`[]],
            strict: false,
          });

          return {
            type: decoded.eventName as unknown as SeraEvent["type"],
            ...base,
            args: this.normalizeArgs(decoded.args as Record<string, unknown> | undefined),
          } as SeraEvent;
        } catch (err) {
          // Fall back to scanning other ABIs if address lookup decoding failed
        }
      }

      // Scan all other registered ABIs (handles dynamic deployments and proxy mappings)
      for (const [abiAddress, abi] of Object.entries(ABI_MAP)) {
        if (abiAddress === address.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({
            abi,
            data: data as `0x${string}`,
            topics: topics as [`0x${string}`, ...`0x${string}`[]],
            strict: false,
          });

          return {
            type: decoded.eventName as unknown as SeraEvent["type"],
            ...base,
            args: this.normalizeArgs(decoded.args as Record<string, unknown> | undefined),
          } as SeraEvent;
        } catch (err) {
          // Continue scanning
        }
      }

      return { type: "UnknownEvent", ...base, args: {} };
    } catch (err) {
      if (err instanceof DecoderError) throw err;
      throw new DecoderError(
        "Failed to decode blockchain log due to unexpected internal failure",
        err,
        {
          logAddress: log?.address,
          transactionHash: log?.transactionHash,
        },
      );
    }
  }

  /**
   * Normalizes argument values by converting mixed-case addresses to lower case.
   */
  private normalizeArgs(args: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!args) return {};
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)) {
        normalized[key] = value.toLowerCase();
      } else {
        normalized[key] = value;
      }
    }
    return normalized;
  }
}
