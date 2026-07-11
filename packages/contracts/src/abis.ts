export const VAULT_ABI = [
  {
    type: "event",
    name: "Deposited",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const SERA_ABI = [
  {
    type: "event",
    name: "OrderMatched",
    inputs: [
      { name: "orderHash0", type: "bytes32", indexed: true },
      { name: "user0", type: "address", indexed: true },
      { name: "token0", type: "address", indexed: false },
      { name: "amount0", type: "uint256", indexed: false },
      { name: "protocolTake0", type: "uint256", indexed: false },
      { name: "orderHash1", type: "bytes32", indexed: true },
      { name: "user1", type: "address", indexed: false },
      { name: "token1", type: "address", indexed: false },
      { name: "amount1", type: "uint256", indexed: false },
      { name: "protocolTake1", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "InstantWithdraw",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "uuid", type: "uint256", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "recipient", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "WithdrawRequested",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "requestBlock", type: "uint256", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Withdraw",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "matchOrders",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_match",
        type: "tuple",
        components: [
          {
            name: "order0",
            type: "tuple",
            components: [
              { name: "user", type: "address" },
              { name: "fromToken", type: "address" },
              { name: "toToken", type: "address" },
              { name: "amount", type: "uint256" },
              { name: "price", type: "uint256" },
              { name: "uuid", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          {
            name: "order1",
            type: "tuple",
            components: [
              { name: "user", type: "address" },
              { name: "fromToken", type: "address" },
              { name: "toToken", type: "address" },
              { name: "amount", type: "uint256" },
              { name: "price", type: "uint256" },
              { name: "uuid", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          { name: "matchAmount0", type: "uint256" },
          { name: "matchAmount1", type: "uint256" },
          { name: "sig0", type: "bytes" },
          { name: "sig1", type: "bytes" },
        ],
      },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "executeInstantWithdrawDualSig",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "tokens", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
      { name: "recipient", type: "address" },
      { name: "deadline", type: "uint256" },
      { name: "uuid", type: "uint256" },
      { name: "userSig", type: "bytes" },
      { name: "execSig", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "emergencyWithdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const SERA_SOR_ABI = [
  {
    type: "event",
    name: "IntentMatched",
    inputs: [
      { name: "intentHash", type: "bytes32", indexed: true },
      { name: "taker", type: "address", indexed: true },
      { name: "legCount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "IntentLegMatched",
    inputs: [
      { name: "intentHash", type: "bytes32", indexed: true },
      { name: "legIndex", type: "uint256", indexed: true },
      { name: "takerOrderHash", type: "bytes32", indexed: false },
      { name: "makerOrderHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "function",
    name: "executeIntent",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "taker", type: "address" },
          { name: "inputToken", type: "address" },
          { name: "outputToken", type: "address" },
          { name: "maxInputAmount", type: "uint256" },
          { name: "minOutputAmount", type: "uint256" },
          { name: "uuid", type: "uint256" },
          { name: "deadline", type: "uint256" },
          {
            name: "legs",
            type: "tuple[]",
            components: [
              { name: "maker", type: "address" },
              { name: "inputToken", type: "address" },
              { name: "outputToken", type: "address" },
              { name: "matchAmount", type: "uint256" },
              { name: "price", type: "uint256" },
              { name: "uuid", type: "uint256" },
              { name: "deadline", type: "uint256" },
              { name: "sig", type: "bytes" },
            ],
          },
        ],
      },
      { name: "intentSignature", type: "bytes" },
      { name: "permitSignature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const SERA_BATCHER_ABI = [
  {
    type: "event",
    name: "BatchExecuted",
    inputs: [
      { name: "attempted", type: "uint256", indexed: false },
      { name: "failedMask", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MatchFailed",
    inputs: [
      { name: "orderHash0", type: "bytes32", indexed: true },
      { name: "orderHash1", type: "bytes32", indexed: true },
      { name: "reason", type: "bytes", indexed: false },
      { name: "batchIndex", type: "uint256", indexed: true },
    ],
  },
  {
    type: "event",
    name: "AtomicBatchExecuted",
    inputs: [{ name: "matchCount", type: "uint256", indexed: false }],
  },
  {
    type: "event",
    name: "AtomicBatchFailed",
    inputs: [
      { name: "batchIndex", type: "uint256", indexed: false },
      { name: "reason", type: "bytes", indexed: false },
    ],
  },
  {
    type: "event",
    name: "IntentFailed",
    inputs: [
      { name: "intentIndex", type: "uint256", indexed: true },
      { name: "reason", type: "bytes", indexed: false },
    ],
  },
] as const;

export const ERC20_METADATA_ABI = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;
