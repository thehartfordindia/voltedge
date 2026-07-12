"use strict";

/**
 * VoltEdge — EV Store backend (Node.js native http, no framework).
 * Sells electric bikes, e-cycles, geared (pedal) cycles, and EV batteries.
 * Provides:
 *   - Product catalog with categories, search, and filters
 *   - Cart-free single-item orders + test-ride / delivery bookings
 *   - "Nearest store" ranking by geolocation
 *   - Demo orders + bookings persisted via store.js (Postgres or file)
 *
 * NOTE: Orders are demo/simulated. No real payment is processed.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./store");

const PORT = Number(process.env.PORT) || 8797;
const ADMIN_SECRET = process.env.ADMIN_SECRET || "change-me";
const PUBLIC_DIR = path.join(__dirname, "..", "public");

/* ============================================================
   Seed data
   ============================================================ */

const CATEGORIES = [
  { id: "ebike", name: "Electric Bikes", icon: "🏍️" },
  { id: "ecycle", name: "E-Cycles", icon: "🚲" },
  { id: "cycle", name: "Geared Cycles", icon: "🚵" },
  { id: "battery", name: "EV Batteries", icon: "🔋" },
];

const PRODUCTS = [
  {
    id: "eb1", category: "ebike", name: "VoltEdge Storm 3000", brand: "VoltEdge", price: 129000, mrp: 145000,
    range: "120 km", topSpeed: "85 km/h", battery: "3.2 kWh Li-ion", charge: "4 hrs",
    colors: ["Matte Black", "Electric Blue"], rating: 4.6, reviews: 214, stock: 8,
    tag: "Best seller", desc: "Full-size electric motorbike with regenerative braking and a smart dash.",
  },
  {
    id: "eb2", category: "ebike", name: "VoltEdge City Rider", brand: "VoltEdge", price: 89000, mrp: 98000,
    range: "90 km", topSpeed: "60 km/h", battery: "2.0 kWh Li-ion", charge: "3 hrs",
    colors: ["Pearl White", "Red"], rating: 4.4, reviews: 156, stock: 14,
    tag: "Commuter", desc: "Lightweight city electric bike, perfect for daily Hyderabad commutes.",
  },
  {
    id: "ec1", category: "ecycle", name: "Breeze E-Cycle Pro", brand: "Breeze", price: 42000, mrp: 47000,
    range: "60 km", topSpeed: "25 km/h", battery: "0.8 kWh removable", charge: "3.5 hrs",
    colors: ["Forest Green", "Grey"], rating: 4.5, reviews: 98, stock: 22,
    tag: "Pedal assist", desc: "Pedal-assist e-cycle with a detachable battery you can charge indoors.",
  },
  {
    id: "ec2", category: "ecycle", name: "Breeze Foldi", brand: "Breeze", price: 34000, mrp: 38000,
    range: "45 km", topSpeed: "25 km/h", battery: "0.5 kWh", charge: "3 hrs",
    colors: ["Black", "Sky Blue"], rating: 4.2, reviews: 71, stock: 17,
    tag: "Foldable", desc: "Folding e-cycle that fits under a desk or in a car boot.",
  },
  {
    id: "cy1", category: "cycle", name: "TrailMaster 21-Speed", brand: "TrailMaster", price: 14500, mrp: 16500,
    range: "—", topSpeed: "—", battery: "None (pedal)", charge: "—",
    colors: ["Orange", "Black"], rating: 4.7, reviews: 342, stock: 40,
    tag: "21 gears", desc: "Classic geared mountain cycle with disc brakes and a sturdy alloy frame.",
  },
  {
    id: "cy2", category: "cycle", name: "UrbanGlide 7-Speed", brand: "UrbanGlide", price: 9800, mrp: 11000,
    range: "—", topSpeed: "—", battery: "None (pedal)", charge: "—",
    colors: ["Teal", "White"], rating: 4.3, reviews: 187, stock: 55,
    tag: "City ride", desc: "Comfortable 7-speed city cycle with a step-through frame and basket mount.",
  },
  {
    id: "bt1", category: "battery", name: "PowerCell 3.2 kWh Pack", brand: "PowerCell", price: 38000, mrp: 42000,
    range: "Fits Storm 3000", topSpeed: "—", battery: "3.2 kWh LFP", charge: "4 hrs",
    colors: ["Standard"], rating: 4.6, reviews: 64, stock: 12,
    tag: "AIS-156", desc: "Certified LFP replacement battery pack with BMS and 3-year warranty.",
  },
  {
    id: "bt2", category: "battery", name: "PowerCell Swap 2.0 kWh", brand: "PowerCell", price: 24000, mrp: 27000,
    range: "Universal 48V", topSpeed: "—", battery: "2.0 kWh LFP", charge: "2.5 hrs",
    colors: ["Standard"], rating: 4.4, reviews: 51, stock: 20,
    tag: "Swappable", desc: "Swappable 48V battery compatible with most e-cycles and scooters.",
  },
];

// Physical stores for "nearest store" ranking.
const STORES = [
  { id: "st1", name: "VoltEdge Jubilee Hills", city: "Hyderabad", lat: 17.431, lon: 78.408 },
  { id: "st2", name: "VoltEdge Gachibowli", city: "Hyderabad", lat: 17.44, lon: 78.348 },
  { id: "st3", name: "VoltEdge Secunderabad", city: "Hyderabad", lat: 17.44, lon: 78.498 },
  { id: "st4", name: "VoltEdge Kukatpally", city: "Hyderabad", lat: 17.494, lon: 78.399 },
];

/* ============================================================
   Helpers
   ============================================================ */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function genId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}
function cleanText(v, max = 120) {
  return String(v == null ? "" : v)
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}
function clampNumber(v, min, max, fallback) {
  const n = Number(v);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (_e) {
        resolve({});
      }
    });
  });
}
function nearestStore(lat, lon) {
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return STORES.map((s) => ({ ...s, distanceKm: Math.round(haversineKm(lat, lon, s.lat, s.lon)) })).sort(
    (a, b) => a.distanceKm - b.distanceKm
  )[0];
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
function serveStatic(res, fileName) {
  const safe = path.normalize(fileName).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  });
}

/* ============================================================
   Router
   ============================================================ */
const server = http.createServer(async (req, res) => {
  const pathname = (req.url || "/").split("?")[0];
  const query = new URLSearchParams((req.url || "").split("?")[1] || "");

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, x-admin-secret",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    res.end();
    return;
  }

  try {
    if (pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, storage: store.mode(), time: new Date().toISOString() });
    }

    if (pathname === "/api/categories") {
      return sendJson(res, 200, { categories: CATEGORIES });
    }

    if (pathname === "/api/products") {
      const category = query.get("category");
      const q = cleanText(query.get("q") || "", 60).toLowerCase();
      const sort = query.get("sort") || "popular";
      let list = PRODUCTS.map((p) => ({ ...p }));
      if (category && category !== "all") list = list.filter((p) => p.category === category);
      if (q) {
        list = list.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.brand.toLowerCase().includes(q) ||
            p.desc.toLowerCase().includes(q)
        );
      }
      if (sort === "price-low") list.sort((a, b) => a.price - b.price);
      else if (sort === "price-high") list.sort((a, b) => b.price - a.price);
      else if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
      else list.sort((a, b) => b.reviews - a.reviews);
      return sendJson(res, 200, { products: list, count: list.length });
    }

    if (pathname.startsWith("/api/products/") && req.method === "GET") {
      const id = decodeURIComponent(pathname.split("/")[3] || "");
      const found = PRODUCTS.find((p) => p.id === id);
      if (!found) return sendJson(res, 404, { error: "Product not found" });
      return sendJson(res, 200, found);
    }

    if (pathname === "/api/stores") {
      const lat = Number(query.get("lat"));
      const lon = Number(query.get("lon"));
      let list = STORES.map((s) => ({ ...s }));
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
        list = list
          .map((s) => ({ ...s, distanceKm: Math.round(haversineKm(lat, lon, s.lat, s.lon)) }))
          .sort((a, b) => a.distanceKm - b.distanceKm);
      }
      return sendJson(res, 200, { stores: list });
    }

    // ---- Orders (buy / book test ride) ----
    if (pathname === "/api/orders" && req.method === "POST") {
      const body = await readBody(req);
      const productId = cleanText(body.productId, 40);
      const product = PRODUCTS.find((p) => p.id === productId);
      if (!product) return sendJson(res, 400, { error: "Unknown product." });

      const kind = body.kind === "testride" ? "TEST_RIDE" : "PURCHASE";
      const name = cleanText(body.name, 80);
      const phone = cleanText(body.phone, 20);
      const address = cleanText(body.address, 240);
      const color = cleanText(body.color, 40) || (product.colors && product.colors[0]) || "";
      if (!name || !phone) return sendJson(res, 400, { error: "Name and phone are required." });

      const lat = Number(body.lat);
      const lon = Number(body.lon);
      const store_ = nearestStore(lat, lon) || STORES[0];

      const order = {
        id: genId(kind === "TEST_RIDE" ? "RIDE" : "ORD"),
        kind,
        status: kind === "TEST_RIDE" ? "BOOKED" : "CONFIRMED",
        product: { id: product.id, name: product.name, price: product.price, category: product.category },
        color,
        qty: kind === "PURCHASE" ? clampNumber(body.qty, 1, 5, 1) : 1,
        amount: kind === "PURCHASE" ? product.price * clampNumber(body.qty, 1, 5, 1) : 0,
        customer: { name, phone, address },
        store: { id: store_.id, name: store_.name, city: store_.city },
        slot: kind === "TEST_RIDE" ? cleanText(body.slot, 40) : "",
        etaDays: kind === "PURCHASE" ? (product.category === "battery" ? 2 : 5) : 0,
        createdAt: new Date().toISOString(),
      };
      await store.saveOrder(order);
      return sendJson(res, 201, order);
    }

    if (pathname === "/api/orders" && req.method === "GET") {
      const id = cleanText(query.get("id") || "", 40);
      if (id) {
        const found = await store.getOrder(id);
        if (!found) return sendJson(res, 404, { error: "Order not found" });
        return sendJson(res, 200, found);
      }
      const phone = cleanText(query.get("phone") || "", 20);
      const all = await store.getOrders();
      const list = phone ? all.filter((o) => o.customer && o.customer.phone === phone) : all;
      return sendJson(res, 200, { orders: list.slice(-50).reverse() });
    }

    // ---- Admin ----
    if (pathname.startsWith("/api/admin/")) {
      if ((req.headers["x-admin-secret"] || "") !== ADMIN_SECRET) {
        return sendJson(res, 401, { error: "Unauthorized" });
      }
      if (pathname === "/api/admin/orders") {
        const all = await store.getOrders();
        return sendJson(res, 200, { orders: all.slice(-200).reverse() });
      }
    }

    // ---- Static ----
    if (pathname === "/" || pathname === "/index.html") return serveStatic(res, "index.html");
    if (pathname === "/styles.css") return serveStatic(res, "styles.css");
    if (pathname === "/app.js") return serveStatic(res, "app.js");
    if (pathname !== "/" && !pathname.startsWith("/api/")) return serveStatic(res, pathname.slice(1));

    return sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    return sendJson(res, 500, { error: "Server error", detail: String(err && err.message) });
  }
});

server.listen(PORT, async () => {
  await store.ensureReady();
  // eslint-disable-next-line no-console
  console.log(`VoltEdge EV Store running on http://localhost:${PORT} (storage: ${store.mode()})`);
});
