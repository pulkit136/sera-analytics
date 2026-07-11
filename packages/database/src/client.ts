import { getConfig } from "@sera/shared";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DatabaseSchema } from "./schema.js";

const { Pool } = pg;

let dbInstance: Kysely<DatabaseSchema> | null = null;

export function getDb(): Kysely<DatabaseSchema> {
  if (dbInstance) {
    return dbInstance;
  }

  const config = getConfig();

  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 10, // pool size limit
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  dbInstance = new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });

  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (dbInstance) {
    await dbInstance.destroy();
    dbInstance = null;
  }
}
