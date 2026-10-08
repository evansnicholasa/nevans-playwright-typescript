import { expect } from "@playwright/test";
import { ConsumeTimeoutError, Given, Then, When } from "../fixtures/world";

Given("I am subscribed to order events", async ({ mq }) => {
  await mq.subscribe();
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

Then("I receive an order.created message for that order", async ({ mq, state }) => {
  const event = await mq.waitForOrderCreated(state.lastOrder!.id);
  expect(event.event).toBe("order.created");
  expect(event.customer).toBe(state.lastOrder!.customer);
  expect(event.item).toBe(state.lastOrder!.item);
});

Then("the wait times out", async ({ state }) => {
  expect(state.mqTimedOut).toBe(true);
});
