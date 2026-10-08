"use strict";

const path = require("path");
const express = require("express");
const { Pool } = require("pg");
const amqplib = require("amqplib");

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const RABBITMQ_URL = process.env.RABBITMQ_URL;

if (!DATABASE_URL || !RABBITMQ_URL) {
  console.error("DATABASE_URL and RABBITMQ_URL are required");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const EXCHANGE = "orders";
const QUEUE = "orders.created";

let amqpChannel;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(label, fn, attempts = 30) {
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.log(`${label} not ready (attempt ${i}/${attempts}): ${error.message}`);
      await sleep(1000);
    }
  }
  throw lastError;
}

async function connectRabbit() {
  const connection = await amqplib.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();
  await channel.assertExchange(EXCHANGE, "fanout", { durable: true });
  await channel.assertQueue(QUEUE, { durable: true });
  await channel.bindQueue(QUEUE, EXCHANGE, "");
  connection.on("error", (error) => {
    console.error("RabbitMQ connection error", error);
  });
  return channel;
}

function publishOrderCreated(order) {
  if (!amqpChannel) {
    throw new Error("RabbitMQ channel is not connected");
  }
  const payload = Buffer.from(JSON.stringify(order));
  amqpChannel.publish(EXCHANGE, "", payload, { persistent: true, contentType: "application/json" });
}

function validateOrder(body) {
  const customer = typeof body.customer === "string" ? body.customer.trim() : "";
  const item = typeof body.item === "string" ? body.item.trim() : "";
  if (!customer || !item) {
    return { error: "Customer and item are required" };
  }
  return { customer, item };
}

async function main() {
  await connectWithRetry("Postgres", () => pool.query("SELECT 1"));
  amqpChannel = await connectWithRetry("RabbitMQ", connectRabbit);

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.get("/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok" });
    } catch (error) {
      res.status(503).json({ status: "degraded", error: error.message });
    }
  });

  app.get("/api/orders", async (_req, res) => {
    const result = await pool.query(
      "SELECT id, customer, item, created_at AS \"createdAt\" FROM orders ORDER BY id DESC"
    );
    res.json(result.rows);
  });

  app.get("/api/orders/:id", async (req, res) => {
    const result = await pool.query(
      "SELECT id, customer, item, created_at AS \"createdAt\" FROM orders WHERE id = $1",
      [req.params.id]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(result.rows[0]);
  });

  app.post("/api/orders", async (req, res) => {
    const parsed = validateOrder(req.body || {});
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const result = await pool.query(
      "INSERT INTO orders (customer, item) VALUES ($1, $2) RETURNING id, customer, item, created_at AS \"createdAt\"",
      [parsed.customer, parsed.item]
    );
    const order = result.rows[0];
    publishOrderCreated({
      event: "order.created",
      id: order.id,
      customer: order.customer,
      item: order.item,
      createdAt: order.createdAt,
    });
    res.status(201).json(order);
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  });

  app.listen(PORT, () => {
    console.log(`Orders demo listening on ${PORT}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
