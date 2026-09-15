import type { Logger } from "../logging/logger";

export type Order = {
  id: number;
  customer: string;
  item: string;
  createdAt: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly log: Logger,
    private readonly token = ""
  ) {}

  private headers(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  async health(): Promise<{ status: string }> {
    return this.request("GET", "/health");
  }

  async listOrders(): Promise<Order[]> {
    return this.request("GET", "/api/orders");
  }

  async getOrder(id: number): Promise<Order> {
    return this.request("GET", `/api/orders/${id}`);
  }

  async createOrder(input: { customer: string; item: string }): Promise<Order> {
    return this.request("POST", "/api/orders", input);
  }

  async createOrderExpectingError(input: Partial<{ customer: string; item: string }>): Promise<{
    status: number;
    body: { error?: string };
  }> {
    const response = await fetch(`${this.baseUrl}/api/orders`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(input),
    });
    const body = (await response.json()) as { error?: string };
    this.log.info({ status: response.status, body }, "api.createOrder error path");
    return { status: response.status, body };
  }

  private async request<T>(method: string, pathname: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers: this.headers(body ? { "Content-Type": "application/json" } : undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = (await response.json()) as T;
    this.log.info({ method, pathname, status: response.status }, "api.request");
    if (!response.ok) {
      throw new ApiError(`${method} ${pathname} failed with ${response.status}`, response.status, payload);
    }
    return payload;
  }
}
