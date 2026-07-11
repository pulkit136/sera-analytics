import type { ERC20MetadataProvider, ERC20ProviderResult, TokenIdentifier } from "@sera/metadata";
import { type MetricRecorder, NoopMetricRecorder } from "@sera/observability";
import type { PublicClient } from "viem";
import { ERC20_METADATA_ABI } from "./abis.js";

/**
 * Viem-backed implementation of ERC20MetadataProvider.
 * Fetches standard token metadata using read-only public client RPC calls.
 */
export class ViemERC20MetadataProvider implements ERC20MetadataProvider {
  private readonly recorder: MetricRecorder;

  constructor(
    private readonly client: PublicClient,
    recorder?: MetricRecorder,
  ) {
    this.recorder = recorder || new NoopMetricRecorder();
  }

  /**
   * Fetches ERC20 name, symbol, and decimals from the EVM network.
   */
  public async fetchMetadata(token: TokenIdentifier): Promise<ERC20ProviderResult> {
    const startTime = performance.now();
    const address = token.address as `0x${string}`;

    // Helper to log metrics on return
    const recordResult = (result: ERC20ProviderResult): ERC20ProviderResult => {
      const durationMs = performance.now() - startTime;
      this.recorder.recordHistogram("rpc_latency_histogram_ms", durationMs, {
        method: "fetchMetadata",
        status: result.status,
      });
      this.recorder.incrementCounter("rpc_requests_total", 1, {
        method: "fetchMetadata",
        status: result.status,
      });
      if (result.status === "failure") {
        this.recorder.incrementCounter("rpc_failures_total", 1, {
          method: "fetchMetadata",
          isTransient: String(result.isTransient),
        });
      }
      return result;
    };

    // 1. Verify that a contract is deployed at the target address
    try {
      const bytecode = await this.client.getBytecode({ address });
      if (!bytecode || bytecode === "0x") {
        return recordResult({ status: "unsupported", reason: "NotAContract" });
      }
    } catch (error) {
      if (this.isTransientError(error)) {
        return recordResult({ status: "failure", error: String(error), isTransient: true });
      }
      return recordResult({ status: "unsupported", reason: "NotAContract" });
    }

    let name: string | null = null;
    let symbol: string | null = null;
    let decimals: number | null = null;

    // 2. Fetch Name (Optional in ERC20 standard)
    try {
      name = await this.client.readContract({
        address,
        abi: ERC20_METADATA_ABI,
        functionName: "name",
      });
    } catch (error) {
      if (this.isTransientError(error)) {
        return recordResult({ status: "failure", error: String(error), isTransient: true });
      }
      // Revert or selector mismatch: treat name as missing (null)
    }

    // 3. Fetch Symbol (Optional in ERC20 standard)
    try {
      symbol = await this.client.readContract({
        address,
        abi: ERC20_METADATA_ABI,
        functionName: "symbol",
      });
    } catch (error) {
      if (this.isTransientError(error)) {
        return recordResult({ status: "failure", error: String(error), isTransient: true });
      }
      // Revert or selector mismatch: treat symbol as missing (null)
    }

    // 4. Fetch Decimals (Required to succeed)
    try {
      const dec = await this.client.readContract({
        address,
        abi: ERC20_METADATA_ABI,
        functionName: "decimals",
      });

      if (typeof dec !== "number" || Number.isNaN(dec)) {
        return recordResult({ status: "unsupported", reason: "InvalidDecimals" });
      }
      decimals = dec;
    } catch (error) {
      if (this.isTransientError(error)) {
        return recordResult({ status: "failure", error: String(error), isTransient: true });
      }
      return recordResult({ status: "unsupported", reason: "MissingMetadataFunctions" });
    }

    return recordResult({
      status: "success",
      name,
      symbol,
      decimals,
    });
  }

  /**
   * Helper to classify transient network/RPC connection errors.
   */
  private isTransientError(error: unknown): boolean {
    const err = error as Error;
    const message = String(err.message || err).toLowerCase();

    if (
      message.includes("rate limit") ||
      message.includes("429") ||
      message.includes("timeout") ||
      message.includes("request limit exceeded") ||
      message.includes("connection") ||
      message.includes("network") ||
      message.includes("unreachable") ||
      message.includes("failed to fetch") ||
      message.includes("too many requests")
    ) {
      return true;
    }

    if (err.name === "HttpRequestError" || err.name === "TimeoutError") {
      return true;
    }

    return false;
  }
}
