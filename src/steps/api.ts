import { expect } from "@playwright/test";
import { apiErrorSchema, assertMatchesContract, orderSchema } from "../api/contracts";
import { Then, When } from "../fixtures/world";

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
