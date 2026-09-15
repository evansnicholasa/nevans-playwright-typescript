import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

const envName = process.env.TEST_ENV ?? "local";
const root = process.cwd();

loadEnv({ path: path.join(root, ".env") });
const envFile = path.join(root, `.env.${envName}`);
if (existsSync(envFile)) {
  loadEnv({ path: envFile, override: true });
}

const schema = z.object({
  TEST_ENV: z.enum(["local", "ci", "staging"]).default("local"),
  BASE_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("postgres://orders:orders@localhost:5432/orders"),
  RABBITMQ_URL: z.string().min(1).default("amqp://guest:guest@localhost:5672"),
  API_TOKEN: z.string().optional().default(""),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  LOG_FILE: z.string().default("logs/test.log"),
  MQ_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cached) {
    return cached;
  }
  cached = schema.parse({
    TEST_ENV: process.env.TEST_ENV ?? envName,
    BASE_URL: process.env.BASE_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    RABBITMQ_URL: process.env.RABBITMQ_URL,
    API_TOKEN: process.env.API_TOKEN,
    LOG_LEVEL: process.env.LOG_LEVEL,
    LOG_FILE: process.env.LOG_FILE,
    MQ_TIMEOUT_MS: process.env.MQ_TIMEOUT_MS,
  });
  return cached;
}
