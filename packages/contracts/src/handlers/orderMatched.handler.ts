import type { OrderMatchedEvent } from "../decoder.js";
import type { NormalizedRecord } from "../normalizer.js";
import type { EventHandler } from "./types.js";

/**
 * Handles OrderMatched events from Sera.
 */
export const OrderMatchedHandler: EventHandler<OrderMatchedEvent> = {
  eventName: "OrderMatched",
  handle(event): NormalizedRecord[] {
    const txHash = event.transactionHash.toLowerCase();
    const blockNumber = Number(event.blockNumber);
    const logIndex = event.logIndex;

    const user0 = event.args.user0.toLowerCase();
    const user1 = event.args.user1.toLowerCase();
    const token0 = event.args.token0.toLowerCase();
    const token1 = event.args.token1.toLowerCase();
    const orderHash0 = event.args.orderHash0.toLowerCase();
    const orderHash1 = event.args.orderHash1.toLowerCase();
    const amount0 = event.args.amount0;
    const amount1 = event.args.amount1;
    const protocolTake0 = event.args.protocolTake0;
    const protocolTake1 = event.args.protocolTake1;

    const tradeId = `${txHash}_${logIndex}`;
    const price0to1 = amount0 === 0n ? "0" : (amount1 / amount0).toString();

    return [
      {
        recordType: "trade",
        trade_id: tradeId,
        tx_hash: txHash,
        block_number: blockNumber,
        log_index: logIndex,
        order_hash_0: orderHash0,
        order_hash_1: orderHash1,
        user_0: user0,
        user_1: user1,
        token_0: token0,
        token_1: token1,
        amount_0: amount0.toString(),
        amount_1: amount1.toString(),
        protocol_take_0: protocolTake0.toString(),
        protocol_take_1: protocolTake1.toString(),
        price_0_to_1: price0to1,
      },
      {
        recordType: "order_fill",
        fill_id: `${tradeId}_${orderHash0.slice(0, 10)}`,
        tx_hash: txHash,
        block_number: blockNumber,
        log_index: logIndex,
        order_hash: orderHash0,
        trade_id: tradeId,
        amount_filled: amount0.toString(),
      },
      {
        recordType: "order_fill",
        fill_id: `${tradeId}_${orderHash1.slice(0, 10)}`,
        tx_hash: txHash,
        block_number: blockNumber,
        log_index: logIndex,
        order_hash: orderHash1,
        trade_id: tradeId,
        amount_filled: amount1.toString(),
      },
    ];
  },
};
