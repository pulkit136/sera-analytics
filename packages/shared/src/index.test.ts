import { describe, expect, it } from "vitest";
import { getConfig, logger } from "./index.js";

describe("Shared Package Configuration", () => {
  it("should retrieve configurations with default parameters", () => {
    const config = getConfig();
    expect(config).toBeDefined();
    expect(config.NODE_ENV).toBe("test");
  });

  it("should instantiate console logger", () => {
    expect(logger).toBeDefined();
    expect(logger.info).toBeTypeOf("function");
  });
});
