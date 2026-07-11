import type { SeraEvent } from "./decoder.js";
import { NormalizerError } from "./errors.js";
import { EventHandlerRegistry } from "./handlers/registry.js";

export interface BaseRecord {
  tx_hash: string;
  block_number: number;
  log_index: number;
  chain_id?: number;
  block_hash?: string;
  transaction_index?: number;
  raw_topics?: string[];
  raw_data?: string;
}

export interface DepositRecord extends BaseRecord {
  recordType: "deposit";
  user_address: string;
  token_address: string;
  amount: string;
}

export interface WithdrawalRecord extends BaseRecord {
  recordType: "withdrawal";
  user_address: string;
  token_address: string;
  amount: string;
  withdrawal_type: string;
  request_block: number | null;
}

export interface TradeRecord extends BaseRecord {
  recordType: "trade";
  trade_id: string;
  order_hash_0: string;
  order_hash_1: string;
  user_0: string;
  user_1: string;
  token_0: string;
  token_1: string;
  amount_0: string;
  amount_1: string;
  protocol_take_0: string;
  protocol_take_1: string;
  price_0_to_1: string;
}

export interface OrderFillRecord extends BaseRecord {
  recordType: "order_fill";
  fill_id: string;
  order_hash: string;
  trade_id: string;
  amount_filled: string;
}

export interface SwapRecord extends BaseRecord {
  recordType: "swap";
  intent_hash: string;
  taker_address: string;
  leg_count: number;
}

export type NormalizedRecord =
  | DepositRecord
  | WithdrawalRecord
  | TradeRecord
  | OrderFillRecord
  | SwapRecord;

/**
 * EventNormalizer maps raw parsed protocol events into relational records.
 */
export interface EventNormalizer {
  /**
   * Normalizes a decoded event into one or more database-ready records.
   *
   * @param event The decoded protocol event.
   * @throws {NormalizerError} If an unexpected error occurs during mapping.
   */
  normalize(event: SeraEvent): NormalizedRecord[];
}

/**
 * DefaultEventNormalizer delegates event mappings to the EventHandlerRegistry.
 */
export class DefaultEventNormalizer implements EventNormalizer {
  /**
   * Translates events into stable normalized record arrays using registered handlers.
   */
  public normalize(event: SeraEvent): NormalizedRecord[] {
    try {
      if (!event) {
        throw new NormalizerError("SeraEvent input parameter cannot be null or undefined");
      }
      const records = EventHandlerRegistry.handle(event);
      return records.map((r) => ({
        ...r,
        chain_id: event.chainId,
        block_hash: event.blockHash,
        transaction_index: event.transactionIndex,
        raw_topics: event.topics,
        raw_data: event.data,
      })) as NormalizedRecord[];
    } catch (err) {
      if (err instanceof NormalizerError) throw err;
      throw new NormalizerError(
        "Failed to normalize event due to unexpected internal failure",
        err,
        {
          eventType: event?.type,
          transactionHash: event?.transactionHash,
        },
      );
    }
  }
}
