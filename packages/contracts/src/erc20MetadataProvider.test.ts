import type { TokenIdentifier } from "@sera/metadata";
import type { PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import { ViemERC20MetadataProvider } from "./erc20MetadataProvider.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ViemERC20MetadataProvider Unit Tests", () => {
  const token: TokenIdentifier = {
    chainId: 1,
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  };

  it("should successfully fetch name, symbol, and decimals", async () => {
    const mockClient = {
      getBytecode: vi.fn().mockResolvedValue("0x60806040"),
      readContract: vi.fn().mockImplementation(async ({ functionName }) => {
        if (functionName === "name") return "USD Coin";
        if (functionName === "symbol") return "USDC";
        if (functionName === "decimals") return 6;
        return null;
      }),
    } as unknown as PublicClient;

    const provider = new ViemERC20MetadataProvider(mockClient);
    const res = await provider.fetchMetadata(token);

    expect(res.status).toBe("success");
    if (res.status === "success") {
      expect(res.name).toBe("USD Coin");
      expect(res.symbol).toBe("USDC");
      expect(res.decimals).toBe(6);
    }
  });

  it("should return unsupported if the target address has no bytecode", async () => {
    const mockClient = {
      getBytecode: vi.fn().mockResolvedValue("0x"),
      readContract: vi.fn(),
    } as unknown as PublicClient;

    const provider = new ViemERC20MetadataProvider(mockClient);
    const res = await provider.fetchMetadata(token);

    expect(res.status).toBe("unsupported");
    if (res.status === "unsupported") {
      expect(res.reason).toBe("NotAContract");
    }
  });

  it("should return unsupported if the decimals call reverts", async () => {
    const mockClient = {
      getBytecode: vi.fn().mockResolvedValue("0x6080"),
      readContract: vi.fn().mockImplementation(async ({ functionName }) => {
        if (functionName === "name") return "Reverting Token";
        if (functionName === "symbol") return "REV";
        if (functionName === "decimals") throw new Error("execution reverted");
        return null;
      }),
    } as unknown as PublicClient;

    const provider = new ViemERC20MetadataProvider(mockClient);
    const res = await provider.fetchMetadata(token);

    expect(res.status).toBe("unsupported");
    if (res.status === "unsupported") {
      expect(res.reason).toBe("MissingMetadataFunctions");
    }
  });

  it("should return unsupported if decimals returns invalid type", async () => {
    const mockClient = {
      getBytecode: vi.fn().mockResolvedValue("0x6080"),
      readContract: vi.fn().mockImplementation(async ({ functionName }) => {
        if (functionName === "name") return "Invalid Token";
        if (functionName === "symbol") return "INV";
        if (functionName === "decimals") return "not-a-number";
        return null;
      }),
    } as unknown as PublicClient;

    const provider = new ViemERC20MetadataProvider(mockClient);
    const res = await provider.fetchMetadata(token);

    expect(res.status).toBe("unsupported");
    if (res.status === "unsupported") {
      expect(res.reason).toBe("InvalidDecimals");
    }
  });

  it("should return transient failure if RPC throws network/rate limit error", async () => {
    const mockClient = {
      getBytecode: vi.fn().mockResolvedValue("0x6080"),
      readContract: vi.fn().mockImplementation(async () => {
        throw new Error("HTTP 429 Too Many Requests");
      }),
    } as unknown as PublicClient;

    const provider = new ViemERC20MetadataProvider(mockClient);
    const res = await provider.fetchMetadata(token);

    expect(res.status).toBe("failure");
    if (res.status === "failure") {
      expect(res.isTransient).toBe(true);
      expect(res.error).toContain("429");
    }
  });
});
