import { describe, expect, it, vi } from "vitest";
import { type ApiDependencies, buildApp } from "./app.js";

describe("HTTP API Route Unit Tests", () => {
  const dummyBlock = {
    chainId: 1,
    blockNumber: 100,
    blockHash: "0xblock100",
    parentBlockHash: "0xblock99",
    isCanonical: true,
  };

  const dummyDeposit = {
    tx_hash: "0xtx1",
    log_index: 0,
    chain_id: 1,
    block_number: 100,
    block_hash: "0xblock100",
    block_timestamp: new Date(1000).toISOString(),
    transaction_index: 2,
    user_address: "0xuser",
    token_address: "0xtoken",
    amount: "5000",
    raw_topics: ["0xtopic1"],
    raw_data: "0xdeadbeef",
  };

  const createMockDependencies = (): ApiDependencies => ({
    block: {
      getBlockByHash: vi.fn(),
      getBlockByNumber: vi.fn(),
      getLatestCanonicalBlock: vi.fn(),
      ping: vi.fn(),
    },
    deposit: {
      getDeposit: vi.fn(),
      listDepositsByUser: vi.fn(),
    },
    withdrawal: {
      getWithdrawal: vi.fn(),
      listWithdrawalsByUser: vi.fn(),
    },
    trade: {
      getTrade: vi.fn(),
      listTradesByUser: vi.fn(),
    },
    metadata: {
      getTokenMetadata: vi.fn(),
    },
  });

  it("GET /health should return service health", async () => {
    const deps = createMockDependencies();
    const app = buildApp(deps);

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "sera-api",
    });
  });

  it("GET /health should return 503 if database ping fails", async () => {
    const deps = createMockDependencies();
    vi.mocked(deps.block.ping).mockRejectedValue(new Error("DB Down"));
    const app = buildApp(deps);

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("GET /blocks/latest should return canonical block", async () => {
    const deps = createMockDependencies();
    vi.mocked(deps.block.getLatestCanonicalBlock).mockResolvedValue(dummyBlock);
    const app = buildApp(deps);

    const response = await app.inject({
      method: "GET",
      url: "/blocks/latest",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(dummyBlock);
    expect(deps.block.getLatestCanonicalBlock).toHaveBeenCalledWith(1);
  });

  it("GET /blocks/:number should validate parameters and return block", async () => {
    const deps = createMockDependencies();
    vi.mocked(deps.block.getBlockByNumber).mockResolvedValue(dummyBlock);
    const app = buildApp(deps);

    // Invalid parameters check
    const badResponse = await app.inject({
      method: "GET",
      url: "/blocks/abc",
    });
    expect(badResponse.statusCode).toBe(400);
    expect(badResponse.json().error.code).toBe("INVALID_PARAMETERS");

    // Success check
    const goodResponse = await app.inject({
      method: "GET",
      url: "/blocks/100",
    });
    expect(goodResponse.statusCode).toBe(200);
    expect(goodResponse.json()).toEqual(dummyBlock);
    expect(deps.block.getBlockByNumber).toHaveBeenCalledWith(1, 100);
  });

  it("GET /blocks/hash/:hash should validate parameters and return block", async () => {
    const deps = createMockDependencies();
    vi.mocked(deps.block.getBlockByHash).mockResolvedValue(null);
    const app = buildApp(deps);

    // Invalid hash format check
    const badResponse = await app.inject({
      method: "GET",
      url: "/blocks/hash/0xshort",
    });
    expect(badResponse.statusCode).toBe(400);

    // Not found check
    const hash = `0x${"a".repeat(64)}`;
    const goodResponse = await app.inject({
      method: "GET",
      url: `/blocks/hash/${hash}`,
    });
    expect(goodResponse.statusCode).toBe(404);
    expect(deps.block.getBlockByHash).toHaveBeenCalledWith(1, hash);
  });

  it("GET /deposits/:txHash/:logIndex should validate parameters and return deposit", async () => {
    const deps = createMockDependencies();
    vi.mocked(deps.deposit.getDeposit).mockResolvedValue(dummyDeposit as any);
    const app = buildApp(deps);

    const txHash = `0x${"b".repeat(64)}`;

    // Validation error check
    const badResponse = await app.inject({
      method: "GET",
      url: `/deposits/${txHash}/-5`,
    });
    expect(badResponse.statusCode).toBe(400);

    // Success check
    const goodResponse = await app.inject({
      method: "GET",
      url: `/deposits/${txHash}/12`,
    });
    expect(goodResponse.statusCode).toBe(200);
    expect(goodResponse.json()).toEqual(dummyDeposit);
    expect(deps.deposit.getDeposit).toHaveBeenCalledWith(1, txHash, 12);
  });

  it("GET /accounts/:address/deposits should validate address and return list", async () => {
    const deps = createMockDependencies();
    vi.mocked(deps.deposit.listDepositsByUser).mockResolvedValue([]);
    const app = buildApp(deps);

    const badResponse = await app.inject({
      method: "GET",
      url: "/accounts/0xinvalid/deposits",
    });
    expect(badResponse.statusCode).toBe(400);

    const address = `0x${"c".repeat(40)}`;
    const goodResponse = await app.inject({
      method: "GET",
      url: `/accounts/${address}/deposits`,
    });
    expect(goodResponse.statusCode).toBe(200);
    expect(goodResponse.json()).toEqual([]);
    expect(deps.deposit.listDepositsByUser).toHaveBeenCalledWith(1, address);
  });

  it("GET /accounts/:address/trades should return trade list", async () => {
    const deps = createMockDependencies();
    vi.mocked(deps.trade.listTradesByUser).mockResolvedValue([]);
    const app = buildApp(deps);

    const address = `0x${"d".repeat(40)}`;
    const response = await app.inject({
      method: "GET",
      url: `/accounts/${address}/trades`,
    });
    expect(response.statusCode).toBe(200);
    expect(deps.trade.listTradesByUser).toHaveBeenCalledWith(1, address);
  });

  it("GET /tokens/:address should return token metadata", async () => {
    const deps = createMockDependencies();
    vi.mocked(deps.metadata.getTokenMetadata).mockResolvedValue({
      chainId: 1,
      tokenAddress: "0xtoken",
      name: "Dai Stablecoin",
      symbol: "DAI",
      decimals: 18,
      source: "Registry",
      blockNumberObserved: 100,
    });
    const app = buildApp(deps);

    const address = `0x${"e".repeat(40)}`;
    const response = await app.inject({
      method: "GET",
      url: `/tokens/${address}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().symbol).toBe("DAI");
  });
});
