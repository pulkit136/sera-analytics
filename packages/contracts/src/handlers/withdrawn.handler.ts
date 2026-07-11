import type { WithdrawnEvent } from "../decoder.js";
import type { NormalizedRecord } from "../normalizer.js";
import type { EventHandler } from "./types.js";

/**
 * Handles Withdrawn events from Vault.
 */
export const WithdrawnHandler: EventHandler<WithdrawnEvent> = {
  eventName: "Withdrawn",
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
        withdrawal_type: "standard",
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
