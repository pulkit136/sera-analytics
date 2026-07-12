import { describe, expect, it, vi } from "vitest";
import { createBlockQueries } from "./BlockQueries.js";

describe("BlockQueries Unit Tests", () => {
  it("getBlockByHash should query block_metadata table and return mapped block", async () => {
    const selectFromSpy = vi.fn().mockReturnThis();
    const selectAllSpy = vi.fn().mockReturnThis();
    const whereSpy = vi.fn().mockReturnThis();
    const executeTakeFirstSpy = vi.fn().mockResolvedValue({
      chain_id: 1,
      block_number: 100,
      block_hash: "0xblock100",
      parent_block_hash: "0xblock99",
      is_canonical: 1,
    });

    const mockDb = {
      selectFrom: selectFromSpy,
      selectAll: selectAllSpy,
      where: whereSpy,
      executeTakeFirst: executeTakeFirstSpy,
    } as any;

    const queries = createBlockQueries(mockDb);
    const result = await queries.getBlockByHash(1, "0xblock100");

    expect(selectFromSpy).toHaveBeenCalledWith("block_metadata");
    expect(whereSpy).toHaveBeenCalledWith("chain_id", "=", 1);
    expect(whereSpy).toHaveBeenCalledWith("block_hash", "=", "0xblock100");
    expect(result).toEqual({
      chainId: 1,
      blockNumber: 100,
      blockHash: "0xblock100",
      parentBlockHash: "0xblock99",
      isCanonical: true,
    });
  });

  it("getBlockByNumber should query block_metadata and return mapped block", async () => {
    const selectFromSpy = vi.fn().mockReturnThis();
    const selectAllSpy = vi.fn().mockReturnThis();
    const whereSpy = vi.fn().mockReturnThis();
    const executeTakeFirstSpy = vi.fn().mockResolvedValue({
      chain_id: 1,
      block_number: 101,
      block_hash: "0xblock101",
      parent_block_hash: "0xblock100",
      is_canonical: 0,
    });

    const mockDb = {
      selectFrom: selectFromSpy,
      selectAll: selectAllSpy,
      where: whereSpy,
      executeTakeFirst: executeTakeFirstSpy,
    } as any;

    const queries = createBlockQueries(mockDb);
    const result = await queries.getBlockByNumber(1, 101);

    expect(selectFromSpy).toHaveBeenCalledWith("block_metadata");
    expect(whereSpy).toHaveBeenCalledWith("chain_id", "=", 1);
    expect(whereSpy).toHaveBeenCalledWith("block_number", "=", 101);
    expect(result?.isCanonical).toBe(false);
  });

  it("getLatestCanonicalBlock should query block_metadata ordering by block_number desc", async () => {
    const selectFromSpy = vi.fn().mockReturnThis();
    const selectAllSpy = vi.fn().mockReturnThis();
    const whereSpy = vi.fn().mockReturnThis();
    const orderBySpy = vi.fn().mockReturnThis();
    const limitSpy = vi.fn().mockReturnThis();
    const executeTakeFirstSpy = vi.fn().mockResolvedValue({
      chain_id: 1,
      block_number: 105,
      block_hash: "0xblock105",
      parent_block_hash: "0xblock104",
      is_canonical: 1,
    });

    const mockDb = {
      selectFrom: selectFromSpy,
      selectAll: selectAllSpy,
      where: whereSpy,
      orderBy: orderBySpy,
      limit: limitSpy,
      executeTakeFirst: executeTakeFirstSpy,
    } as any;

    const queries = createBlockQueries(mockDb);
    const result = await queries.getLatestCanonicalBlock(1);

    expect(selectFromSpy).toHaveBeenCalledWith("block_metadata");
    expect(whereSpy).toHaveBeenCalledWith("chain_id", "=", 1);
    expect(whereSpy).toHaveBeenCalledWith("is_canonical", "=", true);
    expect(orderBySpy).toHaveBeenCalledWith("block_number", "desc");
    expect(limitSpy).toHaveBeenCalledWith(1);
    expect(result?.blockNumber).toBe(105);
  });

  it("should return null for unknown block", async () => {
    const mockDb = {
      selectFrom: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    } as any;

    const queries = createBlockQueries(mockDb);
    const result = await queries.getBlockByHash(1, "0xunknown");

    expect(result).toBeNull();
  });
});
