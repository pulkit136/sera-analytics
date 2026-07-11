import { describe, expect, it } from "vitest";
import { bootstrapIndexLoop } from "./index.js";

describe("Indexer Bootstrap", () => {
  it("should initialize client configurations without throwing", async () => {
    const result = await bootstrapIndexLoop();
    expect(result).toBeDefined();
    expect(result.client).toBeDefined();
    expect(result.db).toBeDefined();
  });
});
