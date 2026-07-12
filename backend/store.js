"use strict";

/**
 * Storage abstraction for VoltEdge EV Store.
 * DATABASE_URL set -> PostgreSQL (optional `pg`). Otherwise -> local JSON files.
 * Stores orders / test-ride bookings.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

const DATABASE_URL = process.env.DATABASE_URL || "";
let pool = null;
let ready = null;

function usingDb() {
  return Boolean(DATABASE_URL);
}
function mode() {
  return usingDb() ? "postgres" : "file";
}
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function readJsonFile(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_e) {
    return fallback;
  }
}
function writeJsonFile(file, value) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

async function ensureReady() {
  if (ready) return ready;
  ready = (async () => {
    if (usingDb()) {
      const { Pool } = require("pg");
      const isLocal = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
      pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: isLocal ? false : { rejectUnauthorized: false },
      });
      await pool.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
    } else {
      ensureDataDir();
      if (!fs.existsSync(ORDERS_FILE)) writeJsonFile(ORDERS_FILE, []);
    }
  })();
  return ready;
}

async function getOrders() {
  await ensureReady();
  if (usingDb()) {
    const res = await pool.query("SELECT data FROM orders ORDER BY created_at ASC");
    return res.rows.map((r) => r.data);
  }
  const list = readJsonFile(ORDERS_FILE, []);
  return Array.isArray(list) ? list : [];
}

async function getOrder(id) {
  await ensureReady();
  if (usingDb()) {
    const res = await pool.query("SELECT data FROM orders WHERE id = $1", [id]);
    return res.rows[0] ? res.rows[0].data : null;
  }
  const list = readJsonFile(ORDERS_FILE, []);
  return (Array.isArray(list) ? list : []).find((o) => o.id === id) || null;
}

async function saveOrder(order) {
  await ensureReady();
  if (usingDb()) {
    await pool.query(
      "INSERT INTO orders (id, data, created_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data",
      [order.id, order, order.createdAt || new Date().toISOString()]
    );
    return;
  }
  const list = readJsonFile(ORDERS_FILE, []);
  const arr = Array.isArray(list) ? list : [];
  const idx = arr.findIndex((o) => o.id === order.id);
  if (idx >= 0) arr[idx] = order;
  else arr.push(order);
  writeJsonFile(ORDERS_FILE, arr);
}

module.exports = { mode, ensureReady, getOrders, getOrder, saveOrder };
