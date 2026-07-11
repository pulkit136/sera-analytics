import { describe, expect, it } from "vitest";
import {
  DefaultDiscoveryEngine,
  DefaultTokenDiscoveryRegistry,
  DepositDiscoveryRule,
  SwapDiscoveryRule,
  WithdrawalDiscoveryRule,
} from "./index.js";
import type { DiscoveryCandidate, TokenDiscoveryRule } from "./index.js";

describe("Token Discovery Subsystem Unit Tests", () => {
  it("should successfully extract a token candidate from a deposit record", () => {
    const rule = new DepositDiscoveryRule();
    const mockRecord = {
      recordType: "deposit",
      chain_id: 1,
      block_number: 1000,
      tx_hash: "0xABC123",
      log_index: 4,
      token_address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      amount: "1000000",
    };

    const res = rule.discover(mockRecord);
    expect(res).toHaveLength(1);
    expect(res[0].tokenAddress).toBe("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
    expect(res[0].chainId).toBe(1);
    expect(res[0].blockNumber).toBe(1000);
    expect(res[0].reason).toBe("Deposit");
    expect(res[0].source.txHash).toBe("0xabc123");
    expect(res[0].source.logIndex).toBe(4);
  });

  it("should successfully extract a token candidate from a withdrawal record", () => {
    const rule = new WithdrawalDiscoveryRule();
    const mockRecord = {
      recordType: "withdrawal",
      chain_id: 1,
      block_number: 1002,
      tx_hash: "0xDEF456",
      log_index: 2,
      token_address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    };

    const res = rule.discover(mockRecord);
    expect(res).toHaveLength(1);
    expect(res[0].tokenAddress).toBe("0xdac17f958d2ee523a2206206994597c13d831ec7");
    expect(res[0].reason).toBe("Withdrawal");
  });

  it("should extract input, output, and fee token candidates from a swap record", () => {
    const rule = new SwapDiscoveryRule();
    const mockRecord = {
      recordType: "swap",
      chain_id: 10,
      block_number: 5000,
      tx_hash: "0x777",
      log_index: 1,
      input_token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      output_token: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      fee_token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    };

    const res = rule.discover(mockRecord);
    expect(res).toHaveLength(3);
    expect(res[0].tokenAddress).toBe("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
    expect(res[0].source.recordId).toBe("0x777:input");

    expect(res[1].tokenAddress).toBe("0xdac17f958d2ee523a2206206994597c13d831ec7");
    expect(res[1].source.recordId).toBe("0x777:output");

    expect(res[2].tokenAddress).toBe("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
    expect(res[2].source.recordId).toBe("0x777:fee");
  });

  it("should ignore invalid or malformed token addresses", () => {
    const rule = new DepositDiscoveryRule();
    const mockRecord = {
      recordType: "deposit",
      token_address: "not-an-address",
    };
    const res = rule.discover(mockRecord);
    expect(res).toHaveLength(0);
  });

  it("should deduplicate candidates by selecting the earliest observation block", () => {
    const registry = new DefaultTokenDiscoveryRegistry();
    registry.register(new DepositDiscoveryRule());
    const engine = new DefaultDiscoveryEngine(registry);

    const records = [
      {
        recordType: "deposit",
        chain_id: 1,
        block_number: 1050,
        tx_hash: "0xaaa",
        log_index: 10,
        token_address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      },
      {
        recordType: "deposit",
        chain_id: 1,
        block_number: 1020, // earliest block
        tx_hash: "0xbbb",
        log_index: 2,
        token_address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      },
      {
        recordType: "deposit",
        chain_id: 1,
        block_number: 1080,
        tx_hash: "0xccc",
        log_index: 5,
        token_address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      },
    ];

    const batch = engine.discoverTokens(records, 1, 1000, 1100);
    expect(batch.tokens).toHaveLength(1);
    expect(batch.tokens[0].blockNumber).toBe(1020);
    expect(batch.tokens[0].source.txHash).toBe("0xbbb");
  });

  it("should deduplicate deterministically using alphabetical txHash when block numbers are identical", () => {
    const registry = new DefaultTokenDiscoveryRegistry();
    registry.register(new DepositDiscoveryRule());
    const engine = new DefaultDiscoveryEngine(registry);

    const records = [
      {
        recordType: "deposit",
        chain_id: 1,
        block_number: 1000,
        tx_hash: "0xzzz", // sorted last
        log_index: 1,
        token_address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      },
      {
        recordType: "deposit",
        chain_id: 1,
        block_number: 1000,
        tx_hash: "0xaaa", // sorted first
        log_index: 5,
        token_address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      },
    ];

    const batch = engine.discoverTokens(records, 1, 1000, 1000);
    expect(batch.tokens).toHaveLength(1);
    expect(batch.tokens[0].source.txHash).toBe("0xaaa");
  });

  it("should sort the final batch tokens in strict chronological/log order", () => {
    const registry = new DefaultTokenDiscoveryRegistry();
    registry.register(new DepositDiscoveryRule());
    const engine = new DefaultDiscoveryEngine(registry);

    const records = [
      {
        recordType: "deposit",
        chain_id: 1,
        block_number: 1020,
        tx_hash: "0xaaa",
        log_index: 1,
        token_address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      },
      {
        recordType: "deposit",
        chain_id: 1,
        block_number: 1010,
        tx_hash: "0xbbb",
        log_index: 2,
        token_address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      },
    ];

    const batch = engine.discoverTokens(records, 1, 1000, 1050);
    expect(batch.tokens).toHaveLength(2);
    // Verified sorting order: block 1010 first, then 1020
    expect(batch.tokens[0].tokenAddress).toBe("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
    expect(batch.tokens[1].tokenAddress).toBe("0xdac17f958d2ee523a2206206994597c13d831ec7");
  });

  it("should support open/closed extensibility through dynamic custom rules", () => {
    const registry = new DefaultTokenDiscoveryRegistry();
    const engine = new DefaultDiscoveryEngine(registry);

    // Register a custom protocol rule
    const customRule: TokenDiscoveryRule = {
      recordType: "custom_mint",
      discover(record: unknown): DiscoveryCandidate[] {
        const rec = record as Record<string, unknown>;
        return [
          {
            chainId: 1,
            tokenAddress: rec.minted_token.toLowerCase(),
            blockNumber: rec.block_number,
            reason: "Other",
            source: {
              recordId: "custom-1",
              txHash: "0x111",
              logIndex: 0,
            },
          },
        ];
      },
    };

    registry.register(customRule);

    const records = [
      {
        recordType: "custom_mint",
        block_number: 9999,
        minted_token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      },
    ];

    const batch = engine.discoverTokens(records, 1, 9000, 10000);
    expect(batch.tokens).toHaveLength(1);
    expect(batch.tokens[0].tokenAddress).toBe("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
  });
});
