import {
  ADDRESSES,
  buildChain,
  buildDepositLog,
  buildIntentMatchedLog,
  buildOrderMatchedLog,
  buildUnknownLog,
} from "./helpers.js";

const orderHash0 = `0x${"1".repeat(64)}`;
const orderHash1 = `0x${"2".repeat(64)}`;
const intentHash = `0x${"3".repeat(64)}`;

// A mixed workload with deposits, trades (OrderMatched), swaps (IntentMatched), and unknown logs
export const mixedFixture = {
  chain: buildChain([
    {
      blockNumber: 200,
      blockHash: "0xblock200",
      parentHash: "0xblock199",
      logs: [
        buildDepositLog({
          txHash: "0xtx200_1",
          logIndex: 0,
          blockNumber: 200,
          blockHash: "0xblock200",
          token: ADDRESSES.TOKEN_USDC,
          user: ADDRESSES.USER_ALICE,
          amount: 5000n,
        }),
        buildUnknownLog({
          txHash: "0xtx200_2",
          logIndex: 1,
          blockNumber: 200,
          blockHash: "0xblock200",
        }),
      ],
    },
    {
      blockNumber: 201,
      blockHash: "0xblock201",
      parentHash: "0xblock200",
      logs: [
        buildOrderMatchedLog({
          txHash: "0xtx201_1",
          logIndex: 0,
          blockNumber: 201,
          blockHash: "0xblock201",
          orderHash0,
          user0: ADDRESSES.USER_ALICE,
          token0: ADDRESSES.TOKEN_USDC,
          amount0: 1000n,
          protocolTake0: 10n,
          orderHash1,
          user1: ADDRESSES.USER_BOB,
          token1: ADDRESSES.TOKEN_WBTC,
          amount1: 1n,
          protocolTake1: 0n,
        }),
      ],
    },
    {
      blockNumber: 202,
      blockHash: "0xblock202",
      parentHash: "0xblock201",
      logs: [
        buildIntentMatchedLog({
          txHash: "0xtx202_1",
          logIndex: 0,
          blockNumber: 202,
          blockHash: "0xblock202",
          intentHash,
          taker: ADDRESSES.USER_ALICE,
          legCount: 1n,
        }),
      ],
    },
  ]),
  expectedCheckpoint: 202,
  expectedOrderHash0: orderHash0,
  expectedIntentHash: intentHash,
};
