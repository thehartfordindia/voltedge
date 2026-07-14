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
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const REVIEWS_FILE = path.join(DATA_DIR, "reviews.json");

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
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS reviews (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
    } else {
      ensureDataDir();
      if (!fs.existsSync(ORDERS_FILE)) writeJsonFile(ORDERS_FILE, []);
      if (!fs.existsSync(USERS_FILE)) writeJsonFile(USERS_FILE, []);
      if (!fs.existsSync(SESSIONS_FILE)) writeJsonFile(SESSIONS_FILE, []);
      if (!fs.existsSync(REVIEWS_FILE)) writeJsonFile(REVIEWS_FILE, []);
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

/* ---------- users ---------- */
async function getUsers() {
  await ensureReady();
  if (usingDb()) {
    const res = await pool.query("SELECT data FROM users ORDER BY created_at ASC");
    return res.rows.map((r) => r.data);
  }
  const list = readJsonFile(USERS_FILE, []);
  return Array.isArray(list) ? list : [];
}

async function saveUsers(users) {
  await ensureReady();
  if (usingDb()) {
    for (const u of users) {
      await pool.query(
        "INSERT INTO users (id, data, created_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data",
        [u.id, u, u.createdAt || new Date().toISOString()]
      );
    }
    return;
  }
  const existing = readJsonFile(USERS_FILE, []);
  const byId = new Map((Array.isArray(existing) ? existing : []).map((u) => [u.id, u]));
  for (const u of users) byId.set(u.id, u);
  writeJsonFile(USERS_FILE, [...byId.values()]);
}

/* ---------- sessions (login tokens) ---------- */
async function getSessions() {
  await ensureReady();
  if (usingDb()) {
    const res = await pool.query("SELECT data FROM sessions ORDER BY created_at ASC");
    return res.rows.map((r) => r.data);
  }
  const list = readJsonFile(SESSIONS_FILE, []);
  return Array.isArray(list) ? list : [];
}

async function saveSessions(sessions) {
  await ensureReady();
  if (usingDb()) {
    for (const s of sessions) {
      await pool.query(
        "INSERT INTO sessions (token, data, created_at) VALUES ($1, $2, $3) ON CONFLICT (token) DO UPDATE SET data = EXCLUDED.data",
        [s.token, s, s.createdAt || new Date().toISOString()]
      );
    }
    return;
  }
  const existing = readJsonFile(SESSIONS_FILE, []);
  const byToken = new Map((Array.isArray(existing) ? existing : []).map((s) => [s.token, s]));
  for (const s of sessions) byToken.set(s.token, s);
  writeJsonFile(SESSIONS_FILE, [...byToken.values()]);
}

async function deleteSession(token) {
  await ensureReady();
  if (usingDb()) {
    await pool.query("DELETE FROM sessions WHERE token = $1", [token]);
    return;
  }
  const existing = readJsonFile(SESSIONS_FILE, []);
  const kept = (Array.isArray(existing) ? existing : []).filter((s) => s.token !== token);
  writeJsonFile(SESSIONS_FILE, kept);
}

/* ---------- reviews (customer-written) ---------- */
async function getReviews() {
  await ensureReady();
  if (usingDb()) {
    const res = await pool.query("SELECT data FROM reviews ORDER BY created_at ASC");
    return res.rows.map((r) => r.data);
  }
  const list = readJsonFile(REVIEWS_FILE, []);
  return Array.isArray(list) ? list : [];
}

async function saveReview(review) {
  await ensureReady();
  if (usingDb()) {
    await pool.query(
      "INSERT INTO reviews (id, data, created_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data",
      [review.id, review, review.createdAt || new Date().toISOString()]
    );
    return;
  }
  const list = readJsonFile(REVIEWS_FILE, []);
  const arr = Array.isArray(list) ? list : [];
  const idx = arr.findIndex((r) => r.id === review.id);
  if (idx >= 0) arr[idx] = review;
  else arr.push(review);
  writeJsonFile(REVIEWS_FILE, arr);
}

async function deleteReview(id) {
  await ensureReady();
  if (usingDb()) {
    await pool.query("DELETE FROM reviews WHERE id = $1", [id]);
    return;
  }
  const existing = readJsonFile(REVIEWS_FILE, []);
  const kept = (Array.isArray(existing) ? existing : []).filter((r) => r.id !== id);
  writeJsonFile(REVIEWS_FILE, kept);
}

module.exports = {
  mode,
  ensureReady,
  getOrders,
  getOrder,
  saveOrder,
  getUsers,
  saveUsers,
  getSessions,
  saveSessions,
  deleteSession,
  getReviews,
  saveReview,
  deleteReview,
};
