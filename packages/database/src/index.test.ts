import { describe, expect, it } from "vitest";
import { getDb } from "./index.js";

describe("Database package tests", () => {
  it("should lazily instantiate Kysely client", () => {
    // Should load config and create instance structure without executing queries
    const db = getDb();
    expect(db).toBeDefined();
    expect(db.selectFrom).toBeTypeOf("function");
  });
});
