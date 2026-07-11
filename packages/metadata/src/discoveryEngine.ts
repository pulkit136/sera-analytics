import type { DiscoveryEngine, TokenDiscoveryRegistry } from "./interfaces.js";
import type { DiscoveredToken, DiscoveryBatch, DiscoveryCandidate } from "./types.js";

/**
 * Default orchestrator and deduplicator engine for token discovery.
 */
export class DefaultDiscoveryEngine implements DiscoveryEngine {
  constructor(private readonly registry: TokenDiscoveryRegistry) {}

  /**
   * Processes a batch of Layer 1 normalized records and returns a deduplicated
   * batch of discovered tokens.
   */
  public discoverTokens(
    records: unknown[],
    chainId: number,
    blockStart: number,
    blockEnd: number,
  ): DiscoveryBatch {
    const allCandidates: DiscoveryCandidate[] = [];

    // 1. Extract candidates using registered rules
    for (const record of records) {
      const rec = record as Record<string, unknown>;
      if (!rec || typeof rec.recordType !== "string") continue;

      const rules = this.registry.getRulesFor(rec.recordType);
      for (const rule of rules) {
        try {
          const candidates = rule.discover(rec);
          allCandidates.push(...candidates);
        } catch (error) {
          // Robust execution: log or ignore rule errors to prevent entire batch failure
          console.error(`Rule discovery failed for record type ${rec.recordType}:`, error);
        }
      }
    }

    // 2. Group candidates by token address to prepare for deduplication
    const grouped = new Map<string, DiscoveryCandidate[]>();
    for (const candidate of allCandidates) {
      // Clean safety check: only process for current target chain
      if (candidate.chainId !== chainId) continue;

      const key = candidate.tokenAddress;
      const list = grouped.get(key) || [];
      list.push(candidate);
      grouped.set(key, list);
    }

    // 3. Deduplicate each group deterministically
    const uniqueTokens: DiscoveredToken[] = [];
    for (const [address, candidates] of grouped.entries()) {
      // Sort candidates to find the canonical one:
      // - Earliest observation (lowest blockNumber) is preferred.
      // - If identical, sort txHash alphabetically.
      // - If still identical, sort logIndex ascending.
      candidates.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) {
          return a.blockNumber - b.blockNumber;
        }
        const txA = a.source.txHash;
        const txB = b.source.txHash;
        if (txA !== txB) {
          return txA.localeCompare(txB);
        }
        return a.source.logIndex - b.source.logIndex;
      });

      const canonical = candidates[0];
      uniqueTokens.push({
        chainId: canonical.chainId,
        tokenAddress: canonical.tokenAddress,
        blockNumber: canonical.blockNumber,
        reason: canonical.reason,
        source: canonical.source,
      });
    }

    // 4. Sort the final unique tokens batch list for strict replay/log order consistency
    uniqueTokens.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) {
        return a.blockNumber - b.blockNumber;
      }
      const txA = a.source.txHash;
      const txB = b.source.txHash;
      if (txA !== txB) {
        return txA.localeCompare(txB);
      }
      return a.source.logIndex - b.source.logIndex;
    });

    return {
      chainId,
      blockStart,
      blockEnd,
      tokens: uniqueTokens,
    };
  }
}
