import type { WithdrawRequestedEvent } from "../decoder.js";
import type { NormalizedRecord } from "../normalizer.js";
import type { EventHandler } from "./types.js";

/**
 * Handles WithdrawRequested events from Sera.
 */
export const WithdrawRequestedHandler: EventHandler<WithdrawRequestedEvent> = {
  eventName: "WithdrawRequested",
  handle(event): NormalizedRecord[] {
    const userAddress = event.args.user.toLowerCase();
    const tokenAddress = event.args.token.toLowerCase();
    const txHash = event.transactionHash.toLowerCase();
    const blockNumber = Number(event.blockNumber);
    const logIndex = event.logIndex;

    return [
      {
        recordType: "withdrawal",
        tx_hash: txHash,
        block_number: blockNumber,
        log_index: logIndex,
        user_address: userAddress,
        token_address: tokenAddress,
        amount: event.args.amount.toString(),
        withdrawal_type: "emergency",
        request_block: Number(event.args.requestBlock),
      },
    ];
  },
};
