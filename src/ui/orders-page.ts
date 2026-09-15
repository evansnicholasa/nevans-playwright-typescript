import type { Page } from "@playwright/test";

export class OrdersPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto("/");
  }

  async createOrder(customer: string, item: string): Promise<void> {
    await this.page.getByTestId("customer-input").fill(customer);
    await this.page.getByTestId("item-input").fill(item);
    await this.page.getByTestId("submit-order").click();
  }

  async submitEmpty(): Promise<void> {
    await this.page.getByTestId("customer-input").fill("");
    await this.page.getByTestId("item-input").fill("");
    await this.page.getByTestId("submit-order").click();
  }

  formError() {
    return this.page.getByTestId("form-error");
  }

  orderRow(customer: string, item: string) {
    return this.page.getByTestId("order-list").getByText(` ${customer} ordered ${item}`);
  }
}
