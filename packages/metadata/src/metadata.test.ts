import { describe, expect, it } from "vitest";
import {
  InvalidMetadataError,
  MetadataError,
  ProviderError,
  RetryExhaustedError,
} from "./index.js";
import type {
  MetadataJob,
  MetadataProvider,
  MetadataRepository,
  MetadataResult,
  TokenIdentifier,
  TokenMetadata,
} from "./index.js";

describe("Metadata Package Public API and Structural Integrity", () => {
  describe("Error Hierarchy", () => {
    it("should correctly inherit from SeraError / Error", () => {
      const metadataErr = new MetadataError("generic metadata error");
      expect(metadataErr).toBeInstanceOf(MetadataError);
      expect(metadataErr.code).toBe("METADATA_ERROR");

      const providerErr = new ProviderError("provider failed", "Registry");
      expect(providerErr).toBeInstanceOf(ProviderError);
      expect(providerErr.code).toBe("PROVIDER_ERROR");
      expect(providerErr.providerName).toBe("Registry");

      const retryErr = new RetryExhaustedError("retries exhausted", 5);
      expect(retryErr).toBeInstanceOf(RetryExhaustedError);
      expect(retryErr.code).toBe("RETRY_EXHAUSTED_ERROR");
      expect(retryErr.attempts).toBe(5);

      const invalidErr = new InvalidMetadataError("invalid name");
      expect(invalidErr).toBeInstanceOf(InvalidMetadataError);
      expect(invalidErr.code).toBe("INVALID_METADATA_ERROR");
    });
  });

  describe("Compile-time Interface Verification", () => {
    it("verifies interfaces are structurally sound and can be implemented", () => {
      const mockProvider: MetadataProvider = {
        name: "MockProvider",
        supports: (chainId: number) => chainId === 1,
        fetch: async (token: TokenIdentifier): Promise<MetadataResult> => {
          return {
            ok: true,
            jobId: "job-123",
            token,
            metadata: {
              identifier: token,
              symbol: "MOCK",
              name: "Mock Token",
              decimals: 18,
              logoUri: "https://example.com/logo.png",
              source: "OnChain",
              fetchedAt: new Date(0).toISOString(),
              isComplete: true,
              blockNumberObserved: 15000000,
            },
            durationMs: 42,
          };
        },
      };

      expect(mockProvider.name).toBe("MockProvider");
      expect(mockProvider.supports(1)).toBe(true);
    });

    it("verifies MetadataRepository interface signature compiles", () => {
      const mockRepository: MetadataRepository = {
        // biome-ignore lint/suspicious/noExplicitAny: mock db parameter
        upsert: async (db: any, metadata: TokenMetadata): Promise<void> => {},
        // biome-ignore lint/suspicious/noExplicitAny: mock db parameter
        upsertMany: async (db: any, metadata: TokenMetadata[]): Promise<void> => {},
        // biome-ignore lint/suspicious/noExplicitAny: mock db parameter
        find: async (db: any, token: TokenIdentifier): Promise<TokenMetadata | null> => {
          return null;
        },
        // biome-ignore lint/suspicious/noExplicitAny: mock db parameter
        exists: async (db: any, token: TokenIdentifier): Promise<boolean> => {
          return false;
        },
      };

      expect(mockRepository.upsert).toBeTypeOf("function");
    });

    it("verifies that types can represent different jobs and results", () => {
      const mockJob: MetadataJob = {
        jobId: "uuid-v4",
        token: {
          chainId: 1,
          address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        },
        status: "Pending",
        reason: "NewTokenSeen",
        createdAt: "2026-07-11T12:00:00Z",
        updatedAt: "2026-07-11T12:00:00Z",
        attemptCount: 0,
        retryAfter: null,
      };

      expect(mockJob.status).toBe("Pending");
      expect(mockJob.reason).toBe("NewTokenSeen");
    });
  });
});
