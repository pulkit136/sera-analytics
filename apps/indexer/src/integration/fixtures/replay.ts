import { buildChain, buildDepositLog, ADDRESSES } from "./helpers.js";

// A simple 3-block chain with deposits
export const replayFixture = {
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
      logs: [],
    },
  ]),
  expectedCheckpoint: 102,
  expectedUsers: [
    { wallet_address: ADDRESSES.USER_ALICE.toLowerCase() },
    { wallet_address: ADDRESSES.USER_BOB.toLowerCase() },
  ],
  expectedDeposits: [
    {
      tx_hash: "0xtx1",
      log_index: 0,
      block_number: 100,
      user_address: ADDRESSES.USER_ALICE.toLowerCase(),
      token_address: ADDRESSES.TOKEN_USDC.toLowerCase(),
      amount: "1000",
    },
    {
      tx_hash: "0xtx2",
      log_index: 0,
      block_number: 101,
      user_address: ADDRESSES.USER_BOB.toLowerCase(),
      token_address: ADDRESSES.TOKEN_WBTC.toLowerCase(),
      amount: "50",
    },
  ],
};
