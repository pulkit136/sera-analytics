import { buildChain, buildDepositLog, ADDRESSES } from "./helpers.js";

// chainA represents the initial fork: block 100 -> block 101 (hashA) -> block 102 (hashA)
export const reorgChainA = buildChain([
  {
    blockNumber: 100,
    blockHash: "0xblock100",
    parentHash: "0xblock99",
    logs: [
      buildDepositLog({
        txHash: "0xtx1",
        logIndex: 0,
        blockNumber: 100,
        blockHash: "0xblock100",
        token: ADDRESSES.TOKEN_USDC,
        user: ADDRESSES.USER_ALICE,
        amount: 1000n,
      }),
    ],
  },
  {
    blockNumber: 101,
    blockHash: "0xblock101_hashA",
    parentHash: "0xblock100",
    logs: [
      buildDepositLog({
        txHash: "0xtx2_hashA",
        logIndex: 0,
        blockNumber: 101,
        blockHash: "0xblock101_hashA",
        token: ADDRESSES.TOKEN_USDC,
        user: ADDRESSES.USER_BOB,
        amount: 2000n,
      }),
    ],
  },
  {
    blockNumber: 102,
    blockHash: "0xblock102_hashA",
    parentHash: "0xblock101_hashA",
    logs: [
      buildDepositLog({
        txHash: "0xtx3_hashA",
        logIndex: 0,
        blockNumber: 102,
        blockHash: "0xblock102_hashA",
        token: ADDRESSES.TOKEN_WBTC,
        user: ADDRESSES.USER_ALICE,
        amount: 100n,
      }),
    ],
  },
]);

// chainB represents the canonical fork after reorganization:
// block 100 -> block 101 (hashB) -> block 102 (hashB) -> block 103 (hashB)
export const reorgChainB = buildChain([
  {
    blockNumber: 100,
    blockHash: "0xblock100",
    parentHash: "0xblock99",
    logs: [
      buildDepositLog({
        txHash: "0xtx1",
        logIndex: 0,
        blockNumber: 100,
        blockHash: "0xblock100",
        token: ADDRESSES.TOKEN_USDC,
        user: ADDRESSES.USER_ALICE,
        amount: 1000n,
      }),
    ],
  },
  {
    blockNumber: 101,
    blockHash: "0xblock101_hashB",
    parentHash: "0xblock100",
    logs: [
      buildDepositLog({
        txHash: "0xtx2_hashB",
        logIndex: 0,
        blockNumber: 101,
        blockHash: "0xblock101_hashB",
        token: ADDRESSES.TOKEN_USDC,
        user: ADDRESSES.USER_BOB,
        amount: 3000n, // Different amount/tx
      }),
    ],
  },
  {
    blockNumber: 102,
    blockHash: "0xblock102_hashB",
    parentHash: "0xblock101_hashB",
    logs: [
      buildDepositLog({
        txHash: "0xtx3_hashB",
        logIndex: 0,
        blockNumber: 102,
        blockHash: "0xblock102_hashB",
        token: ADDRESSES.TOKEN_WBTC,
        user: ADDRESSES.USER_ALICE,
        amount: 150n, // Different amount/tx
      }),
    ],
  },
  {
    blockNumber: 103,
    blockHash: "0xblock103_hashB",
    parentHash: "0xblock102_hashB",
    logs: [
      buildDepositLog({
        txHash: "0xtx4_hashB",
        logIndex: 0,
        blockNumber: 103,
        blockHash: "0xblock103_hashB",
        token: ADDRESSES.TOKEN_USDC,
        user: ADDRESSES.USER_BOB,
        amount: 4000n,
      }),
    ],
  },
]);
