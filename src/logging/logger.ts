import { mkdirSync } from "node:fs";
import path from "node:path";
import pino from "pino";
import type { AppConfig } from "../config/env";

export type Logger = pino.Logger;

export function createLogger(config: AppConfig): Logger {
  const filePath = path.resolve(config.LOG_FILE);
  mkdirSync(path.dirname(filePath), { recursive: true });

  return pino(
    {
      level: config.LOG_LEVEL,
      base: { env: config.TEST_ENV },
    },
    pino.destination({ dest: filePath, sync: false })
  );
}
