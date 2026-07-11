import { encodeAbiParameters, encodeEventTopics, parseAbiParameters } from "viem";
import { describe, expect, it } from "vitest";
import { SERA_ABI, SERA_BATCHER_ABI, SERA_SOR_ABI, VAULT_ABI } from "./abis.js";
import { CONTRACT_ADDRESSES } from "./addresses.js";
import { AbiEventDecoder } from "./decoder.js";
import { DecoderError } from "./errors.js";
import type { BlockchainLog } from "./reader.js";

describe("AbiEventDecoder Unit Tests", () => {
  const decoder = new AbiEventDecoder();

  it("should successfully decode Deposited events from Vault contract", () => {
    const token = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const user = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
    const amount = 1000000n;

    // Deposited(address indexed token, address indexed user, uint256 amount)
    const topics = encodeEventTopics({
      abi: VAULT_ABI,
      eventName: "Deposited",
      args: { token, user },
    });

    const data = encodeAbiParameters(parseAbiParameters("uint256 amount"), [amount]);

    const result = decoder.decode({
      address: CONTRACT_ADDRESSES.VAULT,
      topics,
      data,
      blockNumber: 123n,
      transactionHash: "0xtxhash",
      logIndex: 4,
      blockHash: "0xblockhash",
    });

    expect(result.type).toBe("Deposited");
    if (result.type === "Deposited") {
      expect(result.args.token).toBe(token.toLowerCase());
      expect(result.args.user).toBe(user.toLowerCase());
      expect(result.args.amount).toBe(amount);
    }

    // Verify metadata preservation
    expect(result.contractAddress).toBe(CONTRACT_ADDRESSES.VAULT.toLowerCase());
    expect(result.blockNumber).toBe(123n);
    expect(result.transactionHash).toBe("0xtxhash");
    expect(result.logIndex).toBe(4);
    expect(result.blockHash).toBe("0xblockhash");
  });

  it("should successfully decode OrderMatched events from Sera contract", () => {
    const orderHash0 = `0x${"1".repeat(64)}`;
    const user0 = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
    const token0 = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const amount0 = 5000n;
    const protocolTake0 = 10n;
    const orderHash1 = `0x${"2".repeat(64)}`;
    const user1 = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
    const token1 = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599";
    const amount1 = 2000n;
    const protocolTake1 = 5n;

    const topics = encodeEventTopics({
      abi: SERA_ABI,
      eventName: "OrderMatched",
      args: { orderHash0, user0, orderHash1 },
    });

    const data = encodeAbiParameters(
      parseAbiParameters(
        "address token0, uint256 amount0, uint256 protocolTake0, address user1, address token1, uint256 amount1, uint256 protocolTake1",
      ),
      [
        token0 as `0x${string}`,
        amount0,
        protocolTake0,
        user1 as `0x${string}`,
        token1 as `0x${string}`,
        amount1,
        protocolTake1,
      ],
    );

    const result = decoder.decode({
      address: CONTRACT_ADDRESSES.SERA,
      topics,
      data,
      blockNumber: 124n,
      transactionHash: "0xtxhash2",
      logIndex: 5,
      blockHash: "0xblockhash2",
    });

    expect(result.type).toBe("OrderMatched");
    if (result.type === "OrderMatched") {
      expect(result.args.orderHash0).toBe(orderHash0);
      expect(result.args.user0).toBe(user0.toLowerCase());
      expect(result.args.token0).toBe(token0.toLowerCase());
      expect(result.args.amount0).toBe(amount0);
      expect(result.args.protocolTake0).toBe(protocolTake0);
      expect(result.args.user1).toBe(user1.toLowerCase());
      expect(result.args.token1).toBe(token1.toLowerCase());
      expect(result.args.amount1).toBe(amount1);
      expect(result.args.protocolTake1).toBe(protocolTake1);
    }
  });

  it("should successfully decode IntentMatched events from SeraSOR contract", () => {
    const intentHash = `0x${"3".repeat(64)}`;
    const taker = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
    const legCount = 2n;

    const topics = encodeEventTopics({
      abi: SERA_SOR_ABI,
      eventName: "IntentMatched",
      args: { intentHash, taker },
    });

    const data = encodeAbiParameters(parseAbiParameters("uint256 legCount"), [legCount]);

    const result = decoder.decode({
      address: CONTRACT_ADDRESSES.SERA_SOR,
      topics,
      data,
      blockNumber: 125n,
      transactionHash: "0xtxhash3",
      logIndex: 6,
      blockHash: "0xblockhash3",
    });

    expect(result.type).toBe("IntentMatched");
    if (result.type === "IntentMatched") {
      expect(result.args.intentHash).toBe(intentHash);
      expect(result.args.taker).toBe(taker.toLowerCase());
      expect(result.args.legCount).toBe(legCount);
    }
  });

  it("should successfully decode BatchExecuted events from SeraBatcher contract", () => {
    const attempted = 100n;
    const failedMask = 4n;

    const topics = encodeEventTopics({
      abi: SERA_BATCHER_ABI,
      eventName: "BatchExecuted",
    });

    const data = encodeAbiParameters(parseAbiParameters("uint256 attempted, uint256 failedMask"), [
      attempted,
      failedMask,
    ]);

    const result = decoder.decode({
      address: CONTRACT_ADDRESSES.SERA_BATCHER,
      topics,
      data,
      blockNumber: 126n,
      transactionHash: "0xtxhash4",
      logIndex: 7,
      blockHash: "0xblockhash4",
    });

    expect(result.type).toBe("BatchExecuted");
    if (result.type === "BatchExecuted") {
      expect(result.args.attempted).toBe(attempted);
      expect(result.args.failedMask).toBe(failedMask);
    }
  });

  it("should return UnknownEvent for logs that cannot be decoded against any ABI", () => {
    const result = decoder.decode({
      address: CONTRACT_ADDRESSES.VAULT,
      topics: [`0x${"a".repeat(64)}`], // Invalid random event signature
      data: "0x0000",
      blockNumber: 127n,
      transactionHash: "0xtxhash5",
      logIndex: 8,
      blockHash: "0xblockhash5",
    });

    expect(result.type).toBe("UnknownEvent");
    expect(result.contractAddress).toBe(CONTRACT_ADDRESSES.VAULT.toLowerCase());
    expect(result.args).toEqual({});
  });

  it("should return UnknownEvent for logs with no topics", () => {
    const result = decoder.decode({
      address: CONTRACT_ADDRESSES.VAULT,
      topics: [],
      data: "0x00",
      blockNumber: 128n,
      transactionHash: "0xtxhash6",
      logIndex: 9,
      blockHash: "0xblockhash6",
    });

    expect(result.type).toBe("UnknownEvent");
    expect(result.args).toEqual({});
  });

  it("should scan other ABIs if address is unknown or lookup fails but log matches another ABI signature", () => {
    const token = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const user = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
    const amount = 1000000n;

    // Deposited is in VAULT_ABI. Let's pass it with a random address.
    const topics = encodeEventTopics({
      abi: VAULT_ABI,
      eventName: "Deposited",
      args: { token, user },
    });
    const data = encodeAbiParameters(parseAbiParameters("uint256 amount"), [amount]);

    const result = decoder.decode({
      address: "0x8888888888888888888888888888888888888888", // Unknown contract address
      topics,
      data,
      blockNumber: 129n,
      transactionHash: "0xtxhash7",
      logIndex: 10,
      blockHash: "0xblockhash7",
    });

    expect(result.type).toBe("Deposited");
    if (result.type === "Deposited") {
      expect(result.args.token).toBe(token.toLowerCase());
      expect(result.args.user).toBe(user.toLowerCase());
      expect(result.args.amount).toBe(amount);
    }
  });

  it("should throw DecoderError on unexpected type errors or null parameters", () => {
    expect(() => decoder.decode(null as unknown as BlockchainLog)).toThrow(DecoderError);
  });
});
