import { buildChain } from "./helpers.js";

// A chain of 5 empty blocks to verify checkpoint progression is correct
export const emptyBlocksFixture = {
  chain: buildChain([
    {
      blockNumber: 300,
      blockHash: "0xblock300",
      parentHash: "0xblock299",
      logs: [],
    },
    {
      blockNumber: 301,
      blockHash: "0xblock301",
      parentHash: "0xblock300",
      logs: [],
    },
    {
      blockNumber: 302,
      blockHash: "0xblock302",
      parentHash: "0xblock301",
      logs: [],
    },
    {
      blockNumber: 303,
      blockHash: "0xblock303",
      parentHash: "0xblock302",
      logs: [],
    },
    {
      blockNumber: 304,
      blockHash: "0xblock304",
      parentHash: "0xblock303",
      logs: [],
    },
  ]),
  expectedCheckpoint: 304,
};
