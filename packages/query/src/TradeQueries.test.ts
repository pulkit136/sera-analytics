import { describe, expect, it, vi } from "vitest";
import { createTradeQueries } from "./TradeQueries.js";

describe("TradeQueries Unit Tests", () => {
  const dummyRawData = Buffer.from("deadbeef", "hex");

  it("getTrade should join block_metadata on canonical blocks and query raw_trades", async () => {
    const selectFromSpy = vi.fn().mockReturnThis();
    const innerJoinSpy = vi.fn().mockReturnThis();
    const selectAllSpy = vi.fn().mockReturnThis();
    const whereSpy = vi.fn().mockReturnThis();
    const executeTakeFirstSpy = vi.fn().mockResolvedValue({
      tx_hash: "0xtx1",
      log_index: 0,
      chain_id: 1,
      block_number: 100,
      block_hash: "0xblock100",
      block_timestamp: new Date(1000),
      transaction_index: 2,
      order_hash_0: "0xorder0",
      order_hash_1: "0xorder1",
      user_0: "0xuser0",
      user_1: "0xuser1",
      token_0: "0xtoken0",
      token_1: "0xtoken1",
      amount_0: "1000",
      amount_1: "2000",
      protocol_take_0: "1",
      protocol_take_1: "2",
      raw_topics: ["0xtopic1"],
      raw_data: dummyRawData,
      price_0_to_1: "2",
      trade_id: "0xtx1_0",
    });

    const mockDb = {
      selectFrom: selectFromSpy,
      innerJoin: innerJoinSpy,
      selectAll: selectAllSpy,
      where: whereSpy,
      executeTakeFirst: executeTakeFirstSpy,
    } as any;

    const queries = createTradeQueries(mockDb);
    const result = await queries.getTrade(1, "0xtx1", 0);

    expect(selectFromSpy).toHaveBeenCalledWith("raw_trades");
    expect(innerJoinSpy).toHaveBeenCalledWith("block_metadata", expect.any(Function));
    expect(whereSpy).toHaveBeenCalledWith("raw_trades.chain_id", "=", 1);
    expect(whereSpy).toHaveBeenCalledWith("raw_trades.tx_hash", "=", "0xtx1");
    expect(whereSpy).toHaveBeenCalledWith("raw_trades.log_index", "=", 0);
    expect(whereSpy).toHaveBeenCalledWith("block_metadata.is_canonical", "=", true);

    expect(result?.trade_id).toBe("0xtx1_0");
  });

  it("listTradesByUser should query raw_trades involving user as user_0 or user_1", async () => {
    const selectFromSpy = vi.fn().mockReturnThis();
    const innerJoinSpy = vi.fn().mockReturnThis();
    const selectAllSpy = vi.fn().mockReturnThis();
    const whereSpy = vi.fn().mockReturnThis();
    const orderBySpy = vi.fn().mockReturnThis();
    const executeSpy = vi.fn().mockResolvedValue([]);

    const mockDb = {
      selectFrom: selectFromSpy,
      innerJoin: innerJoinSpy,
      selectAll: selectAllSpy,
      where: whereSpy,
      orderBy: orderBySpy,
      execute: executeSpy,
    } as any;

    const queries = createTradeQueries(mockDb);
    await queries.listTradesByUser(1, "0xuser");

    expect(selectFromSpy).toHaveBeenCalledWith("raw_trades");
    expect(whereSpy).toHaveBeenCalledWith(expect.any(Function)); // OR block user_0 / user_1 check
    expect(orderBySpy).toHaveBeenNthCalledWith(1, "raw_trades.block_number", "desc");
    expect(orderBySpy).toHaveBeenNthCalledWith(2, "raw_trades.transaction_index", "desc");
    expect(orderBySpy).toHaveBeenNthCalledWith(3, "raw_trades.log_index", "desc");
  });
});
