import amqplib, { type Channel, type ChannelModel } from "amqplib";
import type { Logger } from "../logging/logger";

export type OrderCreatedEvent = {
  event: "order.created";
  id: number;
  customer: string;
  item: string;
  createdAt: string;
};

export class ConsumeTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsumeTimeoutError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MqClient {
  private connection: ChannelModel | undefined;
  private channel: Channel | undefined;
  private readonly buffer: OrderCreatedEvent[] = [];

  constructor(
    private readonly url: string,
    private readonly log: Logger,
    private readonly timeoutMs: number
  ) {}

  async connect(): Promise<void> {
    this.connection = await amqplib.connect(this.url);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange("orders", "fanout", { durable: true });
    this.log.info("mq.connected");
  }

  /**
   * Bind an exclusive queue to the fanout exchange so this test gets its own copy
   * of events without competing with the durable work queue. Call this before the
   * write you want to observe.
   */
  async subscribe(): Promise<void> {
    if (!this.channel) {
      throw new Error("RabbitMQ is not connected");
    }
    const { queue } = await this.channel.assertQueue("", { exclusive: true, autoDelete: true });
    await this.channel.bindQueue(queue, "orders", "");
    this.log.info({ queue }, "mq.subscribed");
    await this.channel.consume(
      queue,
      (message) => {
        if (!message) {
          return;
        }
        const payload = JSON.parse(message.content.toString()) as OrderCreatedEvent;
        this.buffer.push(payload);
        this.channel!.ack(message);
        this.log.debug({ payload }, "mq.buffered");
      },
      { noAck: false }
    );
  }

  async waitForOrderCreated(orderId: number, timeoutMs = this.timeoutMs): Promise<OrderCreatedEvent> {
    const deadline = Date.now() + timeoutMs;
    this.log.info({ orderId, timeoutMs }, "mq.waitForOrderCreated");
    while (Date.now() < deadline) {
      const match = this.buffer.find((event) => event.id === orderId);
      if (match) {
        this.log.info({ match }, "mq.matched");
        return match;
      }
      await sleep(50);
    }
    throw new ConsumeTimeoutError(
      `Timed out after ${timeoutMs}ms waiting for order.created id=${orderId}`
    );
  }

  async close(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }
}
