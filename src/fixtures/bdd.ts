import { test as bddTest, createBdd } from "playwright-bdd";
import { ApiClient, type Order } from "../api/client";
import { loadConfig, type AppConfig } from "../config/env";
import { DbClient } from "../db/client";
import { createLogger, type Logger } from "../logging/logger";
import { ConsumeTimeoutError, MqClient } from "../mq/client";
import { OrdersPage } from "../ui/orders-page";

export type ScenarioState = {
  lastOrder?: Order;
  lastApiStatus?: number;
  /** Kept unparsed so contract assertions see exactly what the API sent. */
  lastApiResponseBody?: unknown;
  mqTimedOut?: boolean;
};

export type World = {
  config: AppConfig;
  log: Logger;
  api: ApiClient;
  db: DbClient;
  mq: MqClient;
  ordersPage: OrdersPage;
  uniqueCustomer: string;
  uniqueItem: string;
  state: ScenarioState;
};

export const test = bddTest.extend<World>({
  config: async ({}, use) => {
    await use(loadConfig());
  },
  log: async ({ config }, use) => {
    await use(createLogger(config));
  },
  api: async ({ config, log }, use) => {
    await use(new ApiClient(config.BASE_URL, log, config.API_TOKEN));
  },
  db: async ({ config, log }, use) => {
    const db = new DbClient(config.DATABASE_URL, log);
    await use(db);
    await db.close();
  },
  mq: async ({ config, log }, use) => {
    const mq = new MqClient(config.RABBITMQ_URL, log, config.MQ_TIMEOUT_MS);
    await mq.connect();
    await use(mq);
    await mq.close();
  },
  ordersPage: async ({ page }, use) => {
    await use(new OrdersPage(page));
  },
  uniqueCustomer: async ({}, use) => {
    await use(`QA-${Date.now()}-${Math.floor(Math.random() * 10000)}`);
  },
  uniqueItem: async ({}, use) => {
    await use("Widget");
  },
  state: async ({ db, log }, use) => {
    const state: ScenarioState = {};
    await use(state);
    if (state.lastOrder) {
      await db.deleteOrderById(state.lastOrder.id).catch((error: unknown) => {
        log.warn({ error, id: state.lastOrder?.id }, "cleanup failed");
      });
    }
  },
});

export const { Given, When, Then } = createBdd(test);
export { ConsumeTimeoutError };
