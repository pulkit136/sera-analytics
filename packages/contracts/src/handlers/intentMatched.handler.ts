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

    return [
      {
        recordType: "swap",
        intent_hash: event.args.intentHash.toLowerCase(),
        tx_hash: txHash,
        block_number: blockNumber,
        taker_address: takerAddress,
        input_token: "",
        output_token: "",
        input_amount: "0",
        output_amount: "0",
        routing_path: "[]",
        fee_amount: "0",
        fee_token: "",
      },
      {
        recordType: "user",
        wallet_address: takerAddress,
      },
    ];
  },
};
