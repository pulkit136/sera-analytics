import type { HealthCheck, HealthStatus } from "@sera/observability";
import { sql } from "kysely";
import type { DatabaseContext } from "./schema.js";

/**
 * HealthCheck indicator for Kysely/Postgres database connectivity.
 */
export class DatabaseHealthCheck implements HealthCheck {
  public readonly name = "database";

  constructor(private readonly db: DatabaseContext) {}

  public async check(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();

    try {
      // Execute simple query to verify database is responsive
      await sql`SELECT 1`.execute(this.db);

      return {
        isHealthy: true,
        timestamp,
        details: {
          connection: "connected",
        },
      };
    } catch (error) {
      return {
        isHealthy: false,
        timestamp,
        details: {
          connection: "failed",
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
