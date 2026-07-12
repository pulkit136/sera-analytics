import { describe, expect, it, vi } from "vitest";
import { createDepositQueries, createWithdrawalQueries } from "./DepositQueries.js";

describe("DepositQueries & WithdrawalQueries Unit Tests", () => {
  const dummyRawData = Buffer.from("deadbeef", "hex");

  describe("DepositQueries", () => {
    it("getDeposit should join block_metadata on canonical blocks and query raw_deposits", async () => {
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
        user_address: "0xuser",
        token_address: "0xtoken",
        amount: "5000",
        raw_topics: ["0xtopic1"],
        raw_data: dummyRawData,
      });

      const mockDb = {
        selectFrom: selectFromSpy,
        innerJoin: innerJoinSpy,
        selectAll: selectAllSpy,
        where: whereSpy,
        executeTakeFirst: executeTakeFirstSpy,
      } as any;

      const queries = createDepositQueries(mockDb);
      const result = await queries.getDeposit(1, "0xtx1", 0);

      expect(selectFromSpy).toHaveBeenCalledWith("raw_deposits");
      expect(innerJoinSpy).toHaveBeenCalledWith("block_metadata", expect.any(Function));
      expect(selectAllSpy).toHaveBeenCalledWith("raw_deposits");
      expect(whereSpy).toHaveBeenCalledWith("raw_deposits.chain_id", "=", 1);
      expect(whereSpy).toHaveBeenCalledWith("raw_deposits.tx_hash", "=", "0xtx1");
      expect(whereSpy).toHaveBeenCalledWith("raw_deposits.log_index", "=", 0);
      expect(whereSpy).toHaveBeenCalledWith("block_metadata.is_canonical", "=", true);

      expect(result).toEqual({
        tx_hash: "0xtx1",
        log_index: 0,
        chain_id: 1,
        block_number: 100,
        block_hash: "0xblock100",
        block_timestamp: new Date(1000),
        transaction_index: 2,
        user_address: "0xuser",
        token_address: "0xtoken",
        amount: "5000",
        raw_topics: ["0xtopic1"],
        raw_data: dummyRawData,
      });
    });

    it("listDepositsByUser should query raw_deposits sorted newest first", async () => {
      const selectFromSpy = vi.fn().mockReturnThis();
      const innerJoinSpy = vi.fn().mockReturnThis();
      const selectAllSpy = vi.fn().mockReturnThis();
      const whereSpy = vi.fn().mockReturnThis();
      const orderBySpy = vi.fn().mockReturnThis();
      const executeSpy = vi.fn().mockResolvedValue([
        {
          tx_hash: "0xtx2",
          log_index: 1,
          chain_id: 1,
          block_number: 102,
          block_hash: "0xblock102",
          block_timestamp: new Date(2000),
          transaction_index: 5,
          user_address: "0xuser",
          token_address: "0xtoken",
          amount: "1000",
          raw_topics: ["0xtopic2"],
          raw_data: dummyRawData,
        },
      ]);

      const mockDb = {
        selectFrom: selectFromSpy,
        innerJoin: innerJoinSpy,
        selectAll: selectAllSpy,
        where: whereSpy,
        orderBy: orderBySpy,
        execute: executeSpy,
      } as any;

      const queries = createDepositQueries(mockDb);
      const result = await queries.listDepositsByUser(1, "0xuser");

      expect(selectFromSpy).toHaveBeenCalledWith("raw_deposits");
      expect(whereSpy).toHaveBeenCalledWith("raw_deposits.user_address", "=", "0xuser");
      expect(orderBySpy).toHaveBeenNthCalledWith(1, "raw_deposits.block_number", "desc");
      expect(orderBySpy).toHaveBeenNthCalledWith(2, "raw_deposits.transaction_index", "desc");
      expect(orderBySpy).toHaveBeenNthCalledWith(3, "raw_deposits.log_index", "desc");
      expect(result).toHaveLength(1);
    });

    it("should return empty list when no deposits are found for user", async () => {
      const mockDb = {
        selectFrom: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        selectAll: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue([]),
      } as any;

      const queries = createDepositQueries(mockDb);
      const result = await queries.listDepositsByUser(1, "0xuser");
      expect(result).toEqual([]);
    });
  });

  describe("WithdrawalQueries", () => {
    it("getWithdrawal should query canonical withdrawal", async () => {
      const selectFromSpy = vi.fn().mockReturnThis();
      const innerJoinSpy = vi.fn().mockReturnThis();
      const selectAllSpy = vi.fn().mockReturnThis();
      const whereSpy = vi.fn().mockReturnThis();
      const executeTakeFirstSpy = vi.fn().mockResolvedValue({
        tx_hash: "0xtx3",
        log_index: 0,
        chain_id: 1,
        block_number: 99,
        block_hash: "0xblock99",
        block_timestamp: new Date(500),
        transaction_index: 1,
        user_address: "0xuser",
        token_address: "0xtoken",
        amount: "3000",
        withdrawal_type: "standard",
        request_block: null,
        raw_topics: ["0xtopic3"],
        raw_data: dummyRawData,
      });

      const mockDb = {
        selectFrom: selectFromSpy,
        innerJoin: innerJoinSpy,
        selectAll: selectAllSpy,
        where: whereSpy,
        executeTakeFirst: executeTakeFirstSpy,
      } as any;

      const queries = createWithdrawalQueries(mockDb);
      const result = await queries.getWithdrawal(1, "0xtx3", 0);

      expect(selectFromSpy).toHaveBeenCalledWith("raw_withdrawals");
      expect(result?.withdrawal_type).toBe("standard");
      expect(result?.request_block).toBeNull();
    });

    it("listWithdrawalsByUser should query raw_withdrawals sorted newest first", async () => {
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

      const queries = createWithdrawalQueries(mockDb);
      await queries.listWithdrawalsByUser(1, "0xuser");

      expect(selectFromSpy).toHaveBeenCalledWith("raw_withdrawals");
      expect(orderBySpy).toHaveBeenNthCalledWith(1, "raw_withdrawals.block_number", "desc");
      expect(orderBySpy).toHaveBeenNthCalledWith(2, "raw_withdrawals.transaction_index", "desc");
      expect(orderBySpy).toHaveBeenNthCalledWith(3, "raw_withdrawals.log_index", "desc");
    });
  });
});
