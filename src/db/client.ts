import { Pool } from "pg";
import type { Order } from "../api/client";
import type { Logger } from "../logging/logger";

export class DbClient {
  private readonly pool: Pool;

  constructor(
    connectionString: string,
    private readonly log: Logger
  ) {
    this.pool = new Pool({ connectionString });
  }

  async getOrderById(id: number): Promise<Order | undefined> {
    const result = await this.pool.query<Order>(
      'SELECT id, customer, item, created_at AS "createdAt" FROM orders WHERE id = $1',
      [id]
    );
    this.log.debug({ id, found: result.rowCount }, "db.getOrderById");
    return result.rows[0];
  }

  async findOrderByCustomer(customer: string): Promise<Order | undefined> {
    const result = await this.pool.query<Order>(
      'SELECT id, customer, item, created_at AS "createdAt" FROM orders WHERE customer = $1 ORDER BY id DESC LIMIT 1',
      [customer]
    );
    this.log.debug({ customer, found: result.rowCount }, "db.findOrderByCustomer");
    return result.rows[0];
  }

  async deleteOrderById(id: number): Promise<void> {
    await this.pool.query("DELETE FROM orders WHERE id = $1", [id]);
    this.log.info({ id }, "db.deleteOrderById");
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
