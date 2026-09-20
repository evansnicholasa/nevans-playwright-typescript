import { expect } from "@playwright/test";
import { apiErrorSchema, assertMatchesContract, orderSchema } from "../../src/api/contracts";
import { ConsumeTimeoutError, Given, Then, When } from "../../src/fixtures/bdd";

Given("I open the orders page", async ({ ordersPage }) => {
  await ordersPage.goto();
});

Given("I am subscribed to order events", async ({ mq }) => {
  await mq.subscribe();
});

When("I submit an order for a unique customer", async ({ ordersPage, uniqueCustomer, uniqueItem }) => {
  await ordersPage.createOrder(uniqueCustomer, uniqueItem);
});

When("I submit the order form empty", async ({ ordersPage }) => {
  await ordersPage.submitEmpty();
});

When("I create an order through the API", async ({ api, uniqueCustomer, uniqueItem, state }) => {
  const order = await api.createOrder({ customer: uniqueCustomer, item: uniqueItem });
  state.lastOrder = order;
  state.lastApiResponseBody = order;
  state.lastApiStatus = 201;
});

When("I create an order through the API with no customer", async ({ api, uniqueItem, state }) => {
  const result = await api.createOrderExpectingError({ item: uniqueItem, customer: "" });
  state.lastApiStatus = result.status;
  state.lastApiResponseBody = result.body;
});

When("I wait for a message for order id {int}", async ({ mq, state }, orderId: number) => {
  try {
    await mq.waitForOrderCreated(orderId, 2000);
    state.mqTimedOut = false;
  } catch (error) {
    if (error instanceof ConsumeTimeoutError) {
      state.mqTimedOut = true;
      return;
    }
    throw error;
  }
});

Then("the order appears in the list", async ({ ordersPage, uniqueCustomer, uniqueItem }) => {
  await expect(ordersPage.orderRow(uniqueCustomer, uniqueItem)).toBeVisible();
});

Then("I see the validation error {string}", async ({ ordersPage }, message: string) => {
  await expect(ordersPage.formError()).toHaveText(message);
});

Then("the API returns {int} with customer and item", async ({ state, uniqueCustomer, uniqueItem }, status: number) => {
  expect(state.lastApiStatus).toBe(status);
  expect(state.lastOrder?.customer).toBe(uniqueCustomer);
  expect(state.lastOrder?.item).toBe(uniqueItem);
  expect(state.lastOrder?.id).toBeGreaterThan(0);
});

Then("the response matches the order contract", async ({ state }) => {
  assertMatchesContract(orderSchema, state.lastApiResponseBody, "Order response");
});

Then("the error response matches the error contract", async ({ state }) => {
  assertMatchesContract(apiErrorSchema, state.lastApiResponseBody, "Error response");
});

Then("I can fetch that order by id", async ({ api, state }) => {
  const fetched = await api.getOrder(state.lastOrder!.id);
  assertMatchesContract(orderSchema, fetched, "Fetched order response");
  expect(fetched.customer).toBe(state.lastOrder!.customer);
  expect(fetched.item).toBe(state.lastOrder!.item);
});

Then("the API returns {int}", async ({ state }, status: number) => {
  expect(state.lastApiStatus).toBe(status);
});

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

Then("I receive an order.created message for that order", async ({ mq, state }) => {
  const event = await mq.waitForOrderCreated(state.lastOrder!.id);
  expect(event.event).toBe("order.created");
  expect(event.customer).toBe(state.lastOrder!.customer);
  expect(event.item).toBe(state.lastOrder!.item);
});

Then("the wait times out", async ({ state }) => {
  expect(state.mqTimedOut).toBe(true);
});
