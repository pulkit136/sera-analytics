import type { WithdrawEvent } from "../decoder.js";
import type { NormalizedRecord } from "../normalizer.js";
import type { EventHandler } from "./types.js";

/**
 * Handles Withdraw events from Sera.
 */
export const WithdrawHandler: EventHandler<WithdrawEvent> = {
  eventName: "Withdraw",
  handle(event): NormalizedRecord[] {
    const userAddress = event.args.to.toLowerCase();
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
        status: "executed",
        request_block: null,
      },
      {
        recordType: "user",
        wallet_address: userAddress,
      },
    ];
  },
};
