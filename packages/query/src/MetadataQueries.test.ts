import { describe, expect, it, vi } from "vitest";
import { createMetadataQueries } from "./MetadataQueries.js";

describe("MetadataQueries Unit Tests", () => {
  it("getTokenMetadata should fetch metadata from token_metadata table", async () => {
    const selectFromSpy = vi.fn().mockReturnThis();
    const selectAllSpy = vi.fn().mockReturnThis();
    const whereSpy = vi.fn().mockReturnThis();
    const executeTakeFirstSpy = vi.fn().mockResolvedValue({
      chain_id: 1,
      token_address: "0xtoken",
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
      source: "OnChain",
      block_number_observed: 100,
    });

    const mockDb = {
      selectFrom: selectFromSpy,
      selectAll: selectAllSpy,
      where: whereSpy,
      executeTakeFirst: executeTakeFirstSpy,
    } as any;

    const queries = createMetadataQueries(mockDb);
    const result = await queries.getTokenMetadata(1, "0xtoken");

    expect(selectFromSpy).toHaveBeenCalledWith("token_metadata");
    expect(whereSpy).toHaveBeenCalledWith("chain_id", "=", 1);
    expect(whereSpy).toHaveBeenCalledWith("token_address", "=", "0xtoken");
    expect(result).toEqual({
      chainId: 1,
      tokenAddress: "0xtoken",
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
      source: "OnChain",
      blockNumberObserved: 100,
    });
  });

  it("should return null when token metadata is not found", async () => {
    const mockDb = {
      selectFrom: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    } as any;

    const queries = createMetadataQueries(mockDb);
    const result = await queries.getTokenMetadata(1, "0xunknown");

    expect(result).toBeNull();
  });
});
