import { ADDRESSES, buildChain, buildDepositLog } from "./helpers.js";

export const crashFixture = {
  chain: buildChain([
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
      blockHash: "0xblock101",
      parentHash: "0xblock100",
      logs: [
        buildDepositLog({
          txHash: "0xtx2",
          logIndex: 0,
          blockNumber: 101,
          blockHash: "0xblock101",
          token: ADDRESSES.TOKEN_WBTC,
          user: ADDRESSES.USER_BOB,
          amount: 50n,
        }),
      ],
    },
    {
      blockNumber: 102,
      blockHash: "0xblock102",
      parentHash: "0xblock101",
      logs: [
        buildDepositLog({
          txHash: "0xtx3",
          logIndex: 0,
          blockNumber: 102,
          blockHash: "0xblock102",
          token: ADDRESSES.TOKEN_USDC,
          user: ADDRESSES.USER_ALICE,
          amount: 2000n,
        }),
      ],
    },
  ]),
  failOnBlock: 101,
  expectedCheckpoint: 102,
};
