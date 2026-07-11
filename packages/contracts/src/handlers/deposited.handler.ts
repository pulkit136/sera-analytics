import type { DepositedEvent } from "../decoder.js";
import type { NormalizedRecord } from "../normalizer.js";
import type { EventHandler } from "./types.js";

/**
 * Handles Deposited events from Vault.
 */
export const DepositedHandler: EventHandler<DepositedEvent> = {
  eventName: "Deposited",
  handle(event): NormalizedRecord[] {
    const userAddress = event.args.user.toLowerCase();
    const tokenAddress = event.args.token.toLowerCase();
    const txHash = event.transactionHash.toLowerCase();
    const blockNumber = Number(event.blockNumber);
    const logIndex = event.logIndex;

    return [
      {
        recordType: "deposit",
        tx_hash: txHash,
        block_number: blockNumber,
        log_index: logIndex,
        user_address: userAddress,
        token_address: tokenAddress,
        amount: event.args.amount.toString(),
      },
      {
        recordType: "user",
        wallet_address: userAddress,
      },
    ];
  },
};
