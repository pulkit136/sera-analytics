import type { TokenDiscoveryRule } from "./interfaces.js";
import type { DiscoveryCandidate, DiscoveryReason, DiscoverySource } from "./types.js";

/**
 * Validates and normalizes an EVM address.
 * Returns the lowercased address if valid, or null if invalid.
 */
function normalizeAddress(address: unknown): string | null {
  if (typeof address !== "string") return null;
  const cleaned = address.trim().toLowerCase();
  if (/^0x[a-f0-9]{40}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

/**
 * Helper to construct a standard DiscoverySource from a L1 record.
 */
function getSource(record: unknown, fallbackRecordId: string): DiscoverySource {
  const rec = record as Record<string, unknown>;
  const txHash = typeof rec.tx_hash === "string" ? rec.tx_hash.toLowerCase() : "0x";
  const logIndex = typeof rec.log_index === "number" ? rec.log_index : 0;
  const recordId = typeof rec.recordId === "string" ? rec.recordId : fallbackRecordId;

  return {
    recordId,
    txHash,
    logIndex,
  };
}

/**
 * Discovery rule for Layer 1 deposit records.
 */
export class DepositDiscoveryRule implements TokenDiscoveryRule {
  public readonly recordType = "deposit";

  public discover(record: unknown): DiscoveryCandidate[] {
    const rec = record as Record<string, unknown>;
    const chainId = typeof rec.chain_id === "number" ? rec.chain_id : 1;
    const blockNumber = typeof rec.block_number === "number" ? rec.block_number : 0;

    const tokenAddress = normalizeAddress(rec.token_address);
    if (!tokenAddress) return [];

    const source = getSource(rec, `${rec.tx_hash || "tx"}:${rec.log_index || 0}`);

    return [
      {
        chainId,
        tokenAddress,
        blockNumber,
        reason: "Deposit",
        source,
      },
    ];
  }
}

/**
 * Discovery rule for Layer 1 withdrawal records.
 */
export class WithdrawalDiscoveryRule implements TokenDiscoveryRule {
  public readonly recordType = "withdrawal";

  public discover(record: unknown): DiscoveryCandidate[] {
    const rec = record as Record<string, unknown>;
    const chainId = typeof rec.chain_id === "number" ? rec.chain_id : 1;
    const blockNumber = typeof rec.block_number === "number" ? rec.block_number : 0;

    const tokenAddress = normalizeAddress(rec.token_address);
    if (!tokenAddress) return [];

    const source = getSource(rec, `${rec.tx_hash || "tx"}:${rec.log_index || 0}`);

    return [
      {
        chainId,
        tokenAddress,
        blockNumber,
        reason: "Withdrawal",
        source,
      },
    ];
  }
}

/**
 * Discovery rule for Layer 1 swap records.
 * Extracts input_token, output_token, and fee_token if populated.
 */
export class SwapDiscoveryRule implements TokenDiscoveryRule {
  public readonly recordType = "swap";

  public discover(record: unknown): DiscoveryCandidate[] {
    const rec = record as Record<string, unknown>;
    const chainId = typeof rec.chain_id === "number" ? rec.chain_id : 1;
    const blockNumber = typeof rec.block_number === "number" ? rec.block_number : 0;
    const txHash = typeof rec.tx_hash === "string" ? rec.tx_hash.toLowerCase() : "tx";
    const logIndex = typeof rec.log_index === "number" ? rec.log_index : 0;

    const candidates: DiscoveryCandidate[] = [];

    const addToken = (addressField: unknown, reason: DiscoveryReason, suffix: string) => {
      const address = normalizeAddress(addressField);
      if (!address) return;

      // Swap might not have standard log_index; construct a deterministic unique recordId per token role
      const recordId = `${txHash}:${suffix}`;
      const source: DiscoverySource = {
        recordId,
        txHash,
        logIndex,
      };

      candidates.push({
        chainId,
        tokenAddress: address,
        blockNumber,
        reason,
        source,
      });
    };

    addToken(rec.input_token, "Swap", "input");
    addToken(rec.output_token, "Swap", "output");
    if (rec.fee_token) {
      addToken(rec.fee_token, "Swap", "fee");
    }

    return candidates;
  }
}
