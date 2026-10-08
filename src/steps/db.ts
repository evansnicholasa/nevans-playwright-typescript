import { expect } from "@playwright/test";
import { Then } from "../fixtures/world";

Then("Postgres has a matching row", async ({ db, state, uniqueCustomer, uniqueItem }) => {
  const row = await db.getOrderById(state.lastOrder!.id);
  expect(row).toBeTruthy();
  expect(row?.customer).toBe(uniqueCustomer);
  expect(row?.item).toBe(uniqueItem);
});

Then("the order is stored in the database", async ({ db, uniqueCustomer, uniqueItem, state }) => {
  await expect.poll(async () => db.findOrderByCustomer(uniqueCustomer)).toBeTruthy();
  const row = await db.findOrderByCustomer(uniqueCustomer);
  expect(row?.item).toBe(uniqueItem);
  state.lastOrder = row;
});
