import type { SeraEvent } from "./decoder.js";
import { NormalizerError } from "./errors.js";
import { EventHandlerRegistry } from "./handlers/registry.js";

export interface BaseRecord {
  tx_hash: string;
  block_number: number;
}

export interface DepositRecord extends BaseRecord {
  recordType: "deposit";
  log_index: number;
  user_address: string;
  token_address: string;
  amount: string;
}

export interface WithdrawalRecord extends BaseRecord {
  recordType: "withdrawal";
  log_index: number;
  user_address: string;
  token_address: string;
  amount: string;
  withdrawal_type: "standard" | "instant" | "emergency";
  status: "pending_timelock" | "executed" | "cancelled";
  request_block: number | null;
}

export interface TradeRecord extends BaseRecord {
  recordType: "trade";
  trade_id: string; // deterministically generated from txHash + logIndex
  order_hash_0: string;
  order_hash_1: string;
  user_0: string;
  user_1: string;
  token_0: string;
  token_1: string;
  match_amount_0: string;
  match_amount_1: string;
  price_0_to_1: string;
}

export interface OrderFillRecord extends BaseRecord {
  recordType: "order_fill";
  fill_id: string; // deterministically generated from txHash + logIndex + orderHash
  order_hash: string;
  trade_id: string;
  amount_filled: string;
}

export interface SwapRecord extends BaseRecord {
  recordType: "swap";
  intent_hash: string;
  taker_address: string;
  input_token: string;
  output_token: string;
  input_amount: string;
  output_amount: string;
  routing_path: string;
  fee_amount: string;
  fee_token: string;
}

export interface UserRecord {
  recordType: "user";
  wallet_address: string;
}

export type NormalizedRecord =
  | DepositRecord
  | WithdrawalRecord
  | TradeRecord
  | OrderFillRecord
  | SwapRecord
  | UserRecord;

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
      return EventHandlerRegistry.handle(event);
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
