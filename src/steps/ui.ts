import { expect } from "@playwright/test";
import { Given, Then, When } from "../fixtures/world";

Given("I open the orders page", async ({ ordersPage }) => {
  await ordersPage.goto();
});

When("I submit an order for a unique customer", async ({ ordersPage, uniqueCustomer, uniqueItem }) => {
  await ordersPage.createOrder(uniqueCustomer, uniqueItem);
});

When("I submit the order form empty", async ({ ordersPage }) => {
  await ordersPage.submitEmpty();
});

Then("the order appears in the list", async ({ ordersPage, uniqueCustomer, uniqueItem }) => {
  await expect(ordersPage.orderRow(uniqueCustomer, uniqueItem)).toBeVisible();
});

Then("I see the validation error {string}", async ({ ordersPage }, message: string) => {
  await expect(ordersPage.formError()).toHaveText(message);
});
