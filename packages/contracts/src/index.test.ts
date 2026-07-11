import { describe, expect, it } from "vitest";
import {
  CONTRACT_ADDRESSES,
  SERA_ABI,
  SERA_BATCHER_ABI,
  SERA_SOR_ABI,
  VAULT_ABI,
} from "./index.js";

describe("Contracts configuration", () => {
  it("should contain addresses for Vault and Sera contracts", () => {
    expect(CONTRACT_ADDRESSES.VAULT).toBe("0xC7d4Fd2638e6630C8C61329878676b88A8A24D43");
    expect(CONTRACT_ADDRESSES.SERA).toBe("0xB5C50C5D5f038404F85970b7f5B7259C4AC0E198");
  });

  it("should define valid event fields in Vault ABI", () => {
    const depositEvent = VAULT_ABI.find((x) => x.name === "Deposited");
    expect(depositEvent).toBeDefined();
    expect(depositEvent?.type).toBe("event");
  });

  it("should define valid event fields in Sera ABI", () => {
    const matchEvent = SERA_ABI.find((x) => x.name === "OrderMatched");
    expect(matchEvent).toBeDefined();
    expect(matchEvent?.type).toBe("event");
  });
});
