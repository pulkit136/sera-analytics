import type { IntentMatchedEvent } from "../decoder.js";
import type { NormalizedRecord } from "../normalizer.js";
import type { EventHandler } from "./types.js";

/**
 * Handles IntentMatched routed swap events from SeraSOR.
 */
export const IntentMatchedHandler: EventHandler<IntentMatchedEvent> = {
  eventName: "IntentMatched",
  handle(event): NormalizedRecord[] {
    const takerAddress = event.args.taker.toLowerCase();
    const txHash = event.transactionHash.toLowerCase();
    const blockNumber = Number(event.blockNumber);
    const logIndex = event.logIndex;

    return [
      {
        recordType: "swap",
        intent_hash: event.args.intentHash.toLowerCase(),
        tx_hash: txHash,
        block_number: blockNumber,
        log_index: logIndex,
        taker_address: takerAddress,
        leg_count: Number(event.args.legCount),
      },
    ];
  },
};
