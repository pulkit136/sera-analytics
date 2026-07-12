import dotenv from "dotenv";
import { z } from "zod";
import { ConfigurationError } from "./errors.js";

// Load local environment files if present
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  RPC_URL: z.string().url().default("http://localhost:8545"),
  RPC_URL_FALLBACK: z.string().url().optional(),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/sera_data"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  START_BLOCK: z.coerce.number().int().nonnegative().default(20000000),
  RECONFIRMATION_DEPTH: z.coerce.number().int().nonnegative().default(6),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export type Config = z.infer<typeof envSchema>;

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (cachedConfig && process.env.NODE_ENV !== "test") {
    return cachedConfig;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    throw new ConfigurationError("Invalid environment configurations", {
      errors: result.error.format(),
    });
  }

  cachedConfig = result.data;
  return cachedConfig;
}
