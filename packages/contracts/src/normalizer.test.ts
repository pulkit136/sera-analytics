import { describe, expect, it } from "vitest";
import type { SeraEvent } from "./decoder.js";
import { NormalizerError } from "./errors.js";
import { DefaultEventNormalizer } from "./normalizer.js";

describe("DefaultEventNormalizer Unit Tests", () => {
  const normalizer = new DefaultEventNormalizer();

  const baseEventProps = {
    contractAddress: "0xC7d4Fd2638e6630C8C61329878676b88A8A24D43",
    blockNumber: 1000n,
    transactionHash: "0xABCDEF1234567890",
    logIndex: 2,
    topics: ["0x1"],
    data: "0x2",
    blockHash: "0x3",
    transactionIndex: 0,
    chainId: 1,
  };

  it("should normalize Deposited event to DepositRecord", () => {
    const event: SeraEvent = {
      type: "Deposited",
      args: {
        token: "0xTOKENADDRESS",
        user: "0xUSERADDRESS",
        amount: 5000n,
      },
      ...baseEventProps,
    };

    const records = normalizer.normalize(event);

    expect(records).toHaveLength(1);

    const deposit = records.find((r) => r.recordType === "deposit");

    expect(deposit).toEqual({
      recordType: "deposit",
      tx_hash: baseEventProps.transactionHash.toLowerCase(),
      block_number: Number(baseEventProps.blockNumber),
      log_index: baseEventProps.logIndex,
      user_address: "0xuseraddress",
      token_address: "0xtokenaddress",
      amount: "5000",
      chain_id: baseEventProps.chainId,
      block_hash: baseEventProps.blockHash,
      transaction_index: baseEventProps.transactionIndex,
      raw_topics: baseEventProps.topics,
      raw_data: baseEventProps.data,
    });
  });

  it("should normalize Withdrawn event to standard WithdrawalRecord", () => {
    const event: SeraEvent = {
      type: "Withdrawn",
      args: {
        token: "0xTOKENADDRESS",
        user: "0xUSERADDRESS",
        amount: 2500n,
      },
      ...baseEventProps,
    };

    const records = normalizer.normalize(event);

    expect(records).toHaveLength(1);

    const withdrawal = records.find((r) => r.recordType === "withdrawal");
    expect(withdrawal).toEqual({
      recordType: "withdrawal",
      tx_hash: baseEventProps.transactionHash.toLowerCase(),
      block_number: Number(baseEventProps.blockNumber),
      log_index: baseEventProps.logIndex,
      user_address: "0xuseraddress",
      token_address: "0xtokenaddress",
      amount: "2500",
      withdrawal_type: "standard",
      request_block: null,
      chain_id: baseEventProps.chainId,
      block_hash: baseEventProps.blockHash,
      transaction_index: baseEventProps.transactionIndex,
      raw_topics: baseEventProps.topics,
      raw_data: baseEventProps.data,
    });
  });

  it("should normalize InstantWithdraw event to instant WithdrawalRecord", () => {
    const event: SeraEvent = {
      type: "InstantWithdraw",
      args: {
        token: "0xTOKENADDRESS",
        user: "0xUSERADDRESS",
        amount: 3000n,
        uuid: 99n,
        recipient: "0xRECIPIENT",
      },
      ...baseEventProps,
    };

    const records = normalizer.normalize(event);

    expect(records).toHaveLength(1);

    const withdrawal = records.find((r) => r.recordType === "withdrawal");
    expect(withdrawal).toEqual({
      recordType: "withdrawal",
      tx_hash: baseEventProps.transactionHash.toLowerCase(),
      block_number: Number(baseEventProps.blockNumber),
      log_index: baseEventProps.logIndex,
      user_address: "0xuseraddress",
      token_address: "0xtokenaddress",
      amount: "3000",
      withdrawal_type: "instant",
      request_block: null,
      chain_id: baseEventProps.chainId,
      block_hash: baseEventProps.blockHash,
      transaction_index: baseEventProps.transactionIndex,
      raw_topics: baseEventProps.topics,
      raw_data: baseEventProps.data,
    });
  });

  it("should normalize WithdrawRequested event to emergency timelock WithdrawalRecord", () => {
    const event: SeraEvent = {
      type: "WithdrawRequested",
      args: {
        token: "0xTOKENADDRESS",
        user: "0xUSERADDRESS",
        amount: 8000n,
        requestBlock: 950n,
      },
      ...baseEventProps,
    };

    const records = normalizer.normalize(event);

    expect(records).toHaveLength(1);

    const withdrawal = records.find((r) => r.recordType === "withdrawal");
    expect(withdrawal).toEqual({
      recordType: "withdrawal",
      tx_hash: baseEventProps.transactionHash.toLowerCase(),
      block_number: Number(baseEventProps.blockNumber),
      log_index: baseEventProps.logIndex,
      user_address: "0xuseraddress",
      token_address: "0xtokenaddress",
      amount: "8000",
      withdrawal_type: "emergency",
      request_block: 950,
      chain_id: baseEventProps.chainId,
      block_hash: baseEventProps.blockHash,
      transaction_index: baseEventProps.transactionIndex,
      raw_topics: baseEventProps.topics,
      raw_data: baseEventProps.data,
    });
  });

  it("should normalize Withdraw event to executed emergency WithdrawalRecord", () => {
    const event: SeraEvent = {
      type: "Withdraw",
      args: {
        token: "0xTOKENADDRESS",
        to: "0xRECIPIENT",
        amount: 8000n,
      },
      ...baseEventProps,
    };

    const records = normalizer.normalize(event);

    expect(records).toHaveLength(1);

    const withdrawal = records.find((r) => r.recordType === "withdrawal");
    expect(withdrawal).toEqual({
      recordType: "withdrawal",
      tx_hash: baseEventProps.transactionHash.toLowerCase(),
      block_number: Number(baseEventProps.blockNumber),
      log_index: baseEventProps.logIndex,
      user_address: "0xrecipient",
      token_address: "0xtokenaddress",
      amount: "8000",
      withdrawal_type: "emergency",
      request_block: null,
      chain_id: baseEventProps.chainId,
      block_hash: baseEventProps.blockHash,
      transaction_index: baseEventProps.transactionIndex,
      raw_topics: baseEventProps.topics,
      raw_data: baseEventProps.data,
    });
  });

  it("should normalize OrderMatched to a TradeRecord and two OrderFillRecords", () => {
    const event: SeraEvent = {
      type: "OrderMatched",
      args: {
        orderHash0: "0xHASH0",
        user0: "0xUSER0",
        token0: "0xTOKEN0",
        amount0: 1000n,
        protocolTake0: 1n,
        orderHash1: "0xHASH1",
        user1: "0xUSER1",
        token1: "0xTOKEN1",
        amount1: 2000n,
        protocolTake1: 2n,
      },
      ...baseEventProps,
    };

    const records = normalizer.normalize(event);

    expect(records).toHaveLength(3);

    const trade = records.find((r) => r.recordType === "trade");
    const fills = records.filter((r) => r.recordType === "order_fill");

    const expectedTradeId = `${baseEventProps.transactionHash.toLowerCase()}_${baseEventProps.logIndex}`;

    expect(trade).toEqual({
      recordType: "trade",
      trade_id: expectedTradeId,
      tx_hash: baseEventProps.transactionHash.toLowerCase(),
      block_number: Number(baseEventProps.blockNumber),
      log_index: baseEventProps.logIndex,
      order_hash_0: "0xhash0",
      order_hash_1: "0xhash1",
      user_0: "0xuser0",
      user_1: "0xuser1",
      token_0: "0xtoken0",
      token_1: "0xtoken1",
      amount_0: "1000",
      amount_1: "2000",
      protocol_take_0: "1",
      protocol_take_1: "2",
      price_0_to_1: "2", // 2000 / 1000 = 2
      chain_id: baseEventProps.chainId,
      block_hash: baseEventProps.blockHash,
      transaction_index: baseEventProps.transactionIndex,
      raw_topics: baseEventProps.topics,
      raw_data: baseEventProps.data,
    });

    expect(fills).toHaveLength(2);
    expect(fills[0]).toEqual({
      recordType: "order_fill",
      fill_id: `${expectedTradeId}_0xhash0`,
      tx_hash: baseEventProps.transactionHash.toLowerCase(),
      block_number: Number(baseEventProps.blockNumber),
      log_index: baseEventProps.logIndex,
      order_hash: "0xhash0",
      trade_id: expectedTradeId,
      amount_filled: "1000",
      chain_id: baseEventProps.chainId,
      block_hash: baseEventProps.blockHash,
      transaction_index: baseEventProps.transactionIndex,
      raw_topics: baseEventProps.topics,
      raw_data: baseEventProps.data,
    });
  });

  it("should normalize IntentMatched to SwapRecord", () => {
    const event: SeraEvent = {
      type: "IntentMatched",
      args: {
        intentHash: "0xINTENT",
        taker: "0xTAKER",
        legCount: 3n,
      },
      ...baseEventProps,
    };

    const records = normalizer.normalize(event);

    expect(records).toHaveLength(1);

    const swap = records.find((r) => r.recordType === "swap");
    expect(swap).toEqual({
      recordType: "swap",
      intent_hash: "0xintent",
      tx_hash: baseEventProps.transactionHash.toLowerCase(),
      block_number: Number(baseEventProps.blockNumber),
      log_index: baseEventProps.logIndex,
      taker_address: "0xtaker",
      leg_count: 3,
      chain_id: baseEventProps.chainId,
      block_hash: baseEventProps.blockHash,
      transaction_index: baseEventProps.transactionIndex,
      raw_topics: baseEventProps.topics,
      raw_data: baseEventProps.data,
    });
  });

  it("should return empty collection [] for UnknownEvent or IntentLegMatched", () => {
    const unknownEvent: SeraEvent = {
      type: "UnknownEvent",
      args: {},
      ...baseEventProps,
    };

    expect(normalizer.normalize(unknownEvent)).toEqual([]);

    const legEvent: SeraEvent = {
      type: "IntentLegMatched",
      args: {
        intentHash: "0xINTENT",
        legIndex: 0n,
        takerOrderHash: "0xTAKER",
        makerOrderHash: "0xMAKER",
      },
      ...baseEventProps,
    };

    expect(normalizer.normalize(legEvent)).toEqual([]);
  });

  it("should throw NormalizerError on unexpected type errors or null parameters", () => {
    expect(() => normalizer.normalize(null as unknown as SeraEvent)).toThrow(NormalizerError);
  });
});
