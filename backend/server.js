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
  { id: "escooter", name: "Electric Scooters", icon: "🛵" },
  { id: "eauto", name: "Electric Autos", icon: "🛺" },
  { id: "ecycle", name: "E-Cycles", icon: "🚲" },
  { id: "solar", name: "Solar Hybrid Cycles", icon: "☀️" },
  { id: "cycle", name: "Geared Cycles", icon: "🚵" },
  { id: "battery", name: "EV Batteries", icon: "🔋" },
  { id: "toys", name: "Kids' Electric Toys", icon: "🧸" },
];

// Marketplaces where VoltEdge products are also listed (e-commerce reach).
const MARKETPLACES = {
  voltedge: { name: "VoltEdge", icon: "⚡" },
  amazon: { name: "Amazon", icon: "📦" },
  flipkart: { name: "Flipkart", icon: "🛒" },
  meesho: { name: "Meesho", icon: "🛍️" },
};

const PRODUCTS = [
  {
    id: "eb1", category: "ebike", name: "VoltEdge Storm 3000", brand: "VoltEdge", price: 129000, mrp: 145000,
    range: "120 km", topSpeed: "85 km/h", battery: "3.2 kWh Li-ion", charge: "4 hrs",
    motor: "3 kW BLDC hub", warranty: "3 yrs / 40,000 km",
    colors: ["Matte Black", "Electric Blue"], rating: 4.6, reviews: 214, stock: 8,
    tag: "Best seller", marketplaces: ["voltedge", "amazon", "flipkart"],
    features: ["Regenerative braking", "Smart color dash", "GPS + anti-theft", "Fast charging", "App connectivity"],
    desc: "Full-size electric motorbike with regenerative braking and a smart dash.",
  },
  {
    id: "eb2", category: "ebike", name: "VoltEdge City Rider", brand: "VoltEdge", price: 89000, mrp: 98000,
    range: "90 km", topSpeed: "60 km/h", battery: "2.0 kWh Li-ion", charge: "3 hrs",
    motor: "1.5 kW BLDC hub", warranty: "3 yrs / 30,000 km",
    colors: ["Pearl White", "Red"], rating: 4.4, reviews: 156, stock: 14,
    tag: "Commuter", marketplaces: ["voltedge", "amazon"],
    features: ["Combi braking", "LED headlamp", "USB charging", "Removable battery"],
    desc: "Lightweight city electric bike, perfect for daily Hyderabad commutes.",
  },
  {
    id: "eb3", category: "ebike", name: "VoltEdge Trailblazer X", brand: "VoltEdge", price: 164000, mrp: 179000,
    range: "150 km", topSpeed: "100 km/h", battery: "4.0 kWh Li-ion", charge: "5 hrs",
    motor: "5 kW mid-drive", warranty: "5 yrs / 60,000 km",
    colors: ["Stealth Grey", "Lime Green"], rating: 4.8, reviews: 89, stock: 5,
    tag: "Flagship", marketplaces: ["voltedge", "amazon", "flipkart"],
    features: ["Off-road tyres", "Regen braking", "TFT dash", "GPS + geo-fence", "Fast charging", "Cruise control"],
    desc: "High-performance electric bike built for highways and weekend trails.",
  },

  {
    id: "es1", category: "escooter", name: "VoltEdge Zip 125", brand: "VoltEdge", price: 94000, mrp: 104000,
    range: "100 km", topSpeed: "65 km/h", battery: "2.5 kWh Li-ion", charge: "3.5 hrs",
    motor: "2.2 kW hub", warranty: "3 yrs / 30,000 km",
    colors: ["Ocean Blue", "Ivory"], rating: 4.5, reviews: 173, stock: 18,
    tag: "Family scooter", marketplaces: ["voltedge", "amazon", "flipkart"],
    features: ["Boot storage", "Reverse mode", "Keyless start", "App connectivity", "3 ride modes"],
    desc: "Comfortable family electric scooter with big boot space and app features.",
  },
  {
    id: "es2", category: "escooter", name: "Breeze Glide Lite", brand: "Breeze", price: 68000, mrp: 74000,
    range: "70 km", topSpeed: "45 km/h", battery: "1.5 kWh removable", charge: "3 hrs",
    motor: "1.2 kW hub", warranty: "2 yrs / 20,000 km",
    colors: ["Mint", "Charcoal"], rating: 4.3, reviews: 121, stock: 26,
    tag: "Budget e-scooter", marketplaces: ["voltedge", "amazon", "meesho"],
    features: ["Removable battery", "Low-speed license-free", "LED cluster", "Anti-theft alarm"],
    desc: "Affordable, license-free electric scooter for short city hops.",
  },

  {
    id: "ea1", category: "eauto", name: "VoltEdge Cargo Auto", brand: "VoltEdge", price: 285000, mrp: 310000,
    range: "130 km", topSpeed: "55 km/h", battery: "7.5 kWh LFP", charge: "5 hrs",
    motor: "8 kW", warranty: "5 yrs / 1,00,000 km",
    colors: ["Yellow", "White"], rating: 4.6, reviews: 64, stock: 6,
    tag: "Commercial", marketplaces: ["voltedge"],
    features: ["500 kg payload", "Fast charging", "Digital cluster", "Low running cost", "3-seater cabin"],
    desc: "Electric three-wheeler cargo auto for last-mile delivery businesses.",
  },
  {
    id: "ea2", category: "eauto", name: "VoltEdge Passenger Auto", brand: "VoltEdge", price: 264000, mrp: 289000,
    range: "120 km", topSpeed: "50 km/h", battery: "6.5 kWh LFP", charge: "4.5 hrs",
    motor: "6 kW", warranty: "5 yrs / 1,00,000 km",
    colors: ["Green", "Blue"], rating: 4.4, reviews: 51, stock: 9,
    tag: "Passenger", marketplaces: ["voltedge"],
    features: ["4+1 seating", "FAME-II eligible", "Regen braking", "Roof carrier", "Low maintenance"],
    desc: "Electric passenger auto-rickshaw ideal for city taxi and shared rides.",
  },

  {
    id: "ec1", category: "ecycle", name: "Breeze E-Cycle Pro", brand: "Breeze", price: 42000, mrp: 47000,
    range: "60 km", topSpeed: "25 km/h", battery: "0.8 kWh removable", charge: "3.5 hrs",
    motor: "250 W hub", warranty: "2 yrs",
    colors: ["Forest Green", "Grey"], rating: 4.5, reviews: 98, stock: 22,
    tag: "Pedal assist", marketplaces: ["voltedge", "amazon", "flipkart"],
    features: ["Pedal assist", "Detachable battery", "Disc brakes", "5 assist levels"],
    desc: "Pedal-assist e-cycle with a detachable battery you can charge indoors.",
  },
  {
    id: "ec2", category: "ecycle", name: "Breeze Foldi", brand: "Breeze", price: 34000, mrp: 38000,
    range: "45 km", topSpeed: "25 km/h", battery: "0.5 kWh", charge: "3 hrs",
    motor: "250 W hub", warranty: "2 yrs",
    colors: ["Black", "Sky Blue"], rating: 4.2, reviews: 71, stock: 17,
    tag: "Foldable", marketplaces: ["voltedge", "amazon", "meesho"],
    features: ["Folds in 10s", "Fits car boot", "Throttle + pedal", "Puncture-proof tyres"],
    desc: "Folding e-cycle that fits under a desk or in a car boot.",
  },

  {
    id: "sc1", category: "solar", name: "VoltEdge SolarRide Hybrid", brand: "VoltEdge", price: 58000, mrp: 66000,
    range: "70 km (solar + battery)", topSpeed: "25 km/h", battery: "0.9 kWh + roof solar panel", charge: "Solar / 3.5 hrs plug",
    motor: "350 W hub", warranty: "3 yrs",
    colors: ["Solar Silver", "Sunrise Orange"], rating: 4.7, reviews: 42, stock: 11,
    tag: "Solar + Pedal + Battery", marketplaces: ["voltedge", "amazon", "flipkart"],
    power: "Solar panel by day · pedal in rain/clouds · battery backup",
    features: ["Rooftop solar panel", "Auto solar charging", "Pedal-power fallback", "Battery backup mode", "Zero running cost in sun"],
    desc: "A smart hybrid bicycle: it charges from its solar panel in sunlight, lets you pedal on cloudy or rainy days, and switches to its electric battery whenever you need a boost.",
  },
  {
    id: "sc2", category: "solar", name: "Breeze SunPedal Lite", brand: "Breeze", price: 44000, mrp: 49000,
    range: "50 km (solar + battery)", topSpeed: "25 km/h", battery: "0.6 kWh + solar trickle panel", charge: "Solar / 3 hrs plug",
    motor: "250 W hub", warranty: "2 yrs",
    colors: ["Sky Blue", "Leaf Green"], rating: 4.4, reviews: 28, stock: 15,
    tag: "Solar + Pedal + Battery", marketplaces: ["voltedge", "amazon"],
    power: "Solar trickle charge · pedal anytime · battery boost",
    features: ["Solar trickle charging", "Pedal-assist", "Battery boost", "Lightweight frame"],
    desc: "Budget solar hybrid cycle — top up from the sun, pedal when it's cloudy, and let the battery help on tired legs.",
  },

  {
    id: "cy1", category: "cycle", name: "TrailMaster 21-Speed", brand: "TrailMaster", price: 14500, mrp: 16500,
    range: "—", topSpeed: "—", battery: "None (pedal)", charge: "—",
    warranty: "1 yr frame",
    colors: ["Orange", "Black"], rating: 4.7, reviews: 342, stock: 40,
    tag: "21 gears", marketplaces: ["voltedge", "amazon", "flipkart", "meesho"],
    features: ["21-speed gears", "Disc brakes", "Alloy frame", "Front suspension"],
    desc: "Classic geared mountain cycle with disc brakes and a sturdy alloy frame.",
  },
  {
    id: "cy2", category: "cycle", name: "UrbanGlide 7-Speed", brand: "UrbanGlide", price: 9800, mrp: 11000,
    range: "—", topSpeed: "—", battery: "None (pedal)", charge: "—",
    warranty: "1 yr frame",
    colors: ["Teal", "White"], rating: 4.3, reviews: 187, stock: 55,
    tag: "City ride", marketplaces: ["voltedge", "amazon", "flipkart", "meesho"],
    features: ["7-speed", "Step-through frame", "Basket mount", "Comfort saddle"],
    desc: "Comfortable 7-speed city cycle with a step-through frame and basket mount.",
  },

  {
    id: "bt1", category: "battery", name: "PowerCell 3.2 kWh Pack", brand: "PowerCell", price: 38000, mrp: 42000,
    range: "Fits Storm 3000", topSpeed: "—", battery: "3.2 kWh LFP", charge: "4 hrs",
    warranty: "3 yrs", fits: ["Electric bikes", "Electric scooters"],
    colors: ["Standard"], rating: 4.6, reviews: 64, stock: 12,
    tag: "AIS-156", marketplaces: ["voltedge", "amazon", "flipkart"],
    features: ["LFP chemistry", "Smart BMS", "AIS-156 certified", "Fast charge"],
    desc: "Certified LFP replacement battery pack with BMS and 3-year warranty.",
  },
  {
    id: "bt2", category: "battery", name: "PowerCell Swap 2.0 kWh", brand: "PowerCell", price: 24000, mrp: 27000,
    range: "Universal 48V", topSpeed: "—", battery: "2.0 kWh LFP", charge: "2.5 hrs",
    warranty: "3 yrs", fits: ["Electric scooters", "E-cycles", "Solar cycles"],
    colors: ["Standard"], rating: 4.4, reviews: 51, stock: 20,
    tag: "Swappable", marketplaces: ["voltedge", "amazon", "flipkart", "meesho"],
    features: ["Swappable design", "Universal 48V", "Lightweight", "Smart BMS"],
    desc: "Swappable 48V battery compatible with most e-cycles and scooters.",
  },
  {
    id: "bt3", category: "battery", name: "PowerCell Auto 7.5 kWh", brand: "PowerCell", price: 74000, mrp: 82000,
    range: "3-wheeler / commercial", topSpeed: "—", battery: "7.5 kWh LFP", charge: "5 hrs",
    warranty: "5 yrs", fits: ["Electric autos", "Cargo 3-wheelers", "Micro EVs"],
    colors: ["Standard"], rating: 4.5, reviews: 33, stock: 8,
    tag: "Commercial", marketplaces: ["voltedge"],
    features: ["High cycle life", "Liquid-cooled cells", "IP67 rated", "Fleet telematics"],
    desc: "Heavy-duty LFP pack for electric autos and last-mile cargo three-wheelers.",
  },
  {
    id: "bt4", category: "battery", name: "PowerCell Car 40 kWh", brand: "PowerCell", price: 385000, mrp: 420000,
    range: "Compact EV cars", topSpeed: "—", battery: "40 kWh LFP module", charge: "6–8 hrs (AC)",
    warranty: "8 yrs / 1,60,000 km", fits: ["Electric cars", "SUVs", "Vans"],
    colors: ["Standard"], rating: 4.7, reviews: 21, stock: 4,
    tag: "Automotive grade", marketplaces: ["voltedge"],
    features: ["Automotive-grade LFP", "Liquid thermal mgmt", "CCS2 compatible", "8-year warranty"],
    desc: "Replacement / upgrade traction battery module for compact electric cars and vans.",
  },
  {
    id: "bt5", category: "battery", name: "PowerCell Portable 1.0 kWh", brand: "PowerCell", price: 14000, mrp: 16000,
    range: "Universal / toys", topSpeed: "—", battery: "1.0 kWh Li-ion", charge: "2 hrs",
    warranty: "2 yrs", fits: ["E-cycles", "Kids' ride-ons", "Portable power"],
    colors: ["Standard"], rating: 4.3, reviews: 44, stock: 30,
    tag: "Portable", marketplaces: ["voltedge", "amazon", "flipkart", "meesho"],
    features: ["Grab-and-go handle", "USB + DC out", "Fits kids' vehicles", "Lightweight"],
    desc: "Compact portable battery for e-cycles, kids' ride-ons and backup power.",
  },

  {
    id: "ty1", category: "toys", name: "MiniVolt Ride-On Jeep", brand: "MiniVolt", price: 8900, mrp: 10500,
    range: "1.5 hrs play", topSpeed: "5 km/h", battery: "12V rechargeable", charge: "8 hrs",
    warranty: "1 yr", ageRange: "2–6 yrs",
    colors: ["Red", "Pink", "Black"], rating: 4.6, reviews: 210, stock: 35,
    tag: "Kids ride-on", marketplaces: ["voltedge", "amazon", "flipkart", "meesho"],
    features: ["Parental remote", "Music + lights", "Seatbelt", "Slow-start safety"],
    desc: "Battery-powered ride-on jeep for toddlers with parental remote control.",
  },
  {
    id: "ty2", category: "toys", name: "MiniVolt Racer RC Car", brand: "MiniVolt", price: 2400, mrp: 2999,
    range: "45 min play", topSpeed: "18 km/h", battery: "7.4V Li-ion", charge: "2 hrs",
    warranty: "6 months", ageRange: "6+ yrs",
    colors: ["Blue", "Green"], rating: 4.4, reviews: 388, stock: 60,
    tag: "Remote control", marketplaces: ["voltedge", "amazon", "flipkart", "meesho"],
    features: ["2.4 GHz remote", "Rechargeable", "Anti-skid tyres", "Drift mode"],
    desc: "High-speed rechargeable RC racing car with 2.4 GHz remote and drift mode.",
  },
  {
    id: "ty3", category: "toys", name: "MiniVolt Kids E-Scooter", brand: "MiniVolt", price: 6500, mrp: 7800,
    range: "8 km", topSpeed: "10 km/h", battery: "24V rechargeable", charge: "5 hrs",
    warranty: "1 yr", ageRange: "6–12 yrs",
    colors: ["Neon Yellow", "Purple"], rating: 4.5, reviews: 156, stock: 28,
    tag: "Kids e-scooter", marketplaces: ["voltedge", "amazon", "flipkart"],
    features: ["Speed limiter", "Hand brake", "Foldable", "LED wheels"],
    desc: "Safe electric kick-scooter for kids with a speed limiter and foldable frame.",
  },
  {
    id: "ty4", category: "toys", name: "MiniVolt Ride-On Bike 6V", brand: "MiniVolt", price: 4200, mrp: 5200,
    range: "1 hr play", topSpeed: "4 km/h", battery: "6V rechargeable", charge: "6 hrs",
    warranty: "1 yr", ageRange: "1.5–4 yrs",
    colors: ["Yellow", "Sky Blue"], rating: 4.3, reviews: 174, stock: 40,
    tag: "Toddler bike", marketplaces: ["voltedge", "amazon", "meesho"],
    features: ["Training wheels", "Horn + lights", "Foot pedal start", "Soft seat"],
    desc: "First electric ride-on motorbike for toddlers with training wheels and lights.",
  },
];

// Physical stores for "nearest store" ranking.
const STORES = [
  { id: "st1", name: "VoltEdge Jubilee Hills", city: "Hyderabad", lat: 17.431, lon: 78.408 },
  { id: "st2", name: "VoltEdge Gachibowli", city: "Hyderabad", lat: 17.44, lon: 78.348 },
  { id: "st3", name: "VoltEdge Secunderabad", city: "Hyderabad", lat: 17.44, lon: 78.498 },
  { id: "st4", name: "VoltEdge Kukatpally", city: "Hyderabad", lat: 17.494, lon: 78.399 },
];

// Seasonal / festival offers shown on the home banner.
const OFFERS = [
  {
    id: "of1", emoji: "🇮🇳", title: "Independence Day Sale", tagline: "Up to 15% off + free helmet",
    code: "FREEDOM15", active: true, until: "Aug 20",
  },
  {
    id: "of2", emoji: "🪔", title: "Diwali Dhamaka", tagline: "Extra ₹5,000 off EV bikes & scooters",
    code: "DIWALI5000", active: true, until: "Nov 15",
  },
  {
    id: "of3", emoji: "🎁", title: "New Year Kickstart", tagline: "10% off kids' electric toys",
    code: "TOYS10", active: true, until: "Jan 10",
  },
  {
    id: "of4", emoji: "🛒", title: "E-commerce coupons", tagline: "Buy on Amazon / Flipkart with AMAZON10 & FLIP1500",
    code: "AMAZON10", active: true, until: "Ongoing",
  },
];

// Discount coupons (festival, e-commerce & welcome codes).
const COUPONS = {
  FREEDOM15: { type: "percent", value: 15, max: 8000, label: "Independence Day — 15% off (max ₹8,000)" },
  DIWALI5000: { type: "flat", value: 5000, minAmount: 50000, label: "Diwali — ₹5,000 off above ₹50,000" },
  TOYS10: { type: "percent", value: 10, max: 1500, label: "Kids' toys — 10% off (max ₹1,500)" },
  AMAZON10: { type: "percent", value: 10, max: 5000, label: "Amazon coupon — 10% off (max ₹5,000)" },
  FLIP1500: { type: "flat", value: 1500, minAmount: 20000, label: "Flipkart — ₹1,500 off above ₹20,000" },
  WELCOME500: { type: "flat", value: 500, label: "Welcome — ₹500 off your first order" },
};

// The VoltEdge operating model (Decathlon-inspired integrated supply chain).
const SUPPLY_CHAIN = {
  headline: "The VoltEdge model — inspired by Decathlon",
  intro:
    "Like Decathlon, VoltEdge designs its own brands, owns its supply chain end-to-end and sells directly to you — so you get better products at lower prices.",
  pillars: [
    { icon: "🏭", title: "In-house brands", text: "We design VoltEdge, Breeze, PowerCell & MiniVolt ourselves — no licensing markups." },
    { icon: "🚚", title: "Own the chain", text: "Factory → regional warehouse → city store → your doorstep, all under one roof." },
    { icon: "🏬", title: "Experience stores", text: "Test-ride hubs in every city where you can touch, ride and buy." },
    { icon: "🛒", title: "Omni-channel", text: "Shop on VoltEdge, Amazon, Flipkart or Meesho — same price, same warranty." },
    { icon: "♻️", title: "Circular batteries", text: "Battery buy-back and recycling keep costs and e-waste down." },
    { icon: "💸", title: "Direct-to-consumer", text: "No middlemen means we pass the savings straight to you." },
  ],
};

/** Validate a coupon code against an order amount. */
function applyCoupon(rawCode, amount) {
  const code = cleanText(rawCode, 24).toUpperCase();
  const coupon = COUPONS[code];
  const amt = clampNumber(amount, 0, 100000000, 0);
  if (!coupon) return { valid: false, error: "Invalid or expired coupon code." };
  if (coupon.minAmount && amt < coupon.minAmount) {
    return { valid: false, error: `Add ₹${(coupon.minAmount - amt).toLocaleString("en-IN")} more to use this coupon.` };
  }
  let discount = coupon.type === "percent" ? Math.round((amt * coupon.value) / 100) : coupon.value;
  if (coupon.max) discount = Math.min(discount, coupon.max);
  discount = Math.min(discount, amt);
  return { valid: true, code, discount, total: amt - discount, label: coupon.label };
}

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
    "Access-Control-Allow-Headers": "Content-Type, x-admin-secret, x-auth-token, authorization",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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

/* ---------- accounts / auth ---------- */
function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), useSalt, 64).toString("hex");
  return { salt: useSalt, hash };
}
function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function publicUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, ...safe } = user;
  return safe;
}
function readAuthToken(req) {
  const header = req.headers["x-auth-token"];
  if (header) return String(header);
  const auth = req.headers["authorization"] || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
}
async function getSessionUser(req) {
  const token = readAuthToken(req);
  if (!token) return null;
  const sessions = await store.getSessions();
  const session = sessions.find((s) => s.token === token);
  if (!session) return null;
  if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) return null;
  const users = await store.getUsers();
  return users.find((u) => u.id === session.userId) || null;
}
async function issueSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  await store.saveSessions([
    {
      token,
      userId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ]);
  return token;
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
      "Access-Control-Allow-Headers": "Content-Type, x-admin-secret, x-auth-token, authorization",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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

    if (pathname === "/api/offers") {
      return sendJson(res, 200, {
        offers: OFFERS.filter((o) => o.active),
        marketplaces: MARKETPLACES,
      });
    }

    if (pathname === "/api/about") {
      return sendJson(res, 200, { about: SUPPLY_CHAIN, stores: STORES });
    }

    if (pathname === "/api/coupon" && req.method === "POST") {
      const body = await readBody(req);
      const result = applyCoupon(body.code, clampNumber(body.amount, 0, 100000000, 0));
      return sendJson(res, result.valid ? 200 : 400, result);
    }

    // ---- Accounts / authentication ----
    if (pathname === "/api/auth/register" && req.method === "POST") {
      const body = await readBody(req);
      const name = cleanText(body.name, 80);
      const email = cleanText(body.email, 120).toLowerCase();
      const phone = cleanText(body.phone, 20);
      const password = String(body.password || "");
      if (!name || !email || !password) {
        return sendJson(res, 400, { error: "Name, email and password are required." });
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return sendJson(res, 400, { error: "Please enter a valid email address." });
      }
      if (password.length < 6) {
        return sendJson(res, 400, { error: "Password must be at least 6 characters." });
      }
      const users = await store.getUsers();
      if (users.some((u) => u.email === email)) {
        return sendJson(res, 409, { error: "An account with this email already exists." });
      }
      const { salt, hash } = hashPassword(password);
      const user = {
        id: genId("USR"),
        name,
        email,
        phone,
        passwordSalt: salt,
        passwordHash: hash,
        createdAt: new Date().toISOString(),
      };
      await store.saveUsers([user]);
      const token = await issueSession(user.id);
      return sendJson(res, 201, { token, user: publicUser(user) });
    }

    if (pathname === "/api/auth/login" && req.method === "POST") {
      const body = await readBody(req);
      const email = cleanText(body.email, 120).toLowerCase();
      const password = String(body.password || "");
      if (!email || !password) {
        return sendJson(res, 400, { error: "Email and password are required." });
      }
      const users = await store.getUsers();
      const user = users.find((u) => u.email === email);
      if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
        return sendJson(res, 401, { error: "Invalid email or password." });
      }
      const token = await issueSession(user.id);
      return sendJson(res, 200, { token, user: publicUser(user) });
    }

    if (pathname === "/api/auth/logout" && req.method === "POST") {
      const token = readAuthToken(req);
      if (token) await store.deleteSession(token);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === "/api/auth/me" && req.method === "GET") {
      const user = await getSessionUser(req);
      if (!user) return sendJson(res, 401, { error: "Not logged in." });
      return sendJson(res, 200, { user: publicUser(user) });
    }

    if (pathname === "/api/my/orders" && req.method === "GET") {
      const user = await getSessionUser(req);
      if (!user) return sendJson(res, 401, { error: "Not logged in." });
      const all = await store.getOrders();
      const list = all.filter(
        (o) => o.userId === user.id || (o.customer && o.customer.phone && o.customer.phone === user.phone)
      );
      return sendJson(res, 200, { orders: list.slice(-50).reverse() });
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

    // ---- Cart checkout (multiple items in one order) ----
    if (pathname === "/api/orders/cart" && req.method === "POST") {
      const body = await readBody(req);
      const rawItems = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
      const items = [];
      let subtotal = 0;
      for (const it of rawItems) {
        const product = PRODUCTS.find((p) => p.id === cleanText(it && it.productId, 40));
        if (!product) continue;
        const qty = clampNumber(it.qty, 1, 20, 1);
        const color = cleanText(it.color, 40) || (product.colors && product.colors[0]) || "";
        subtotal += product.price * qty;
        items.push({ id: product.id, name: product.name, price: product.price, category: product.category, qty, color });
      }
      if (!items.length) return sendJson(res, 400, { error: "Your cart is empty." });

      const name = cleanText(body.name, 80);
      const phone = cleanText(body.phone, 20);
      const address = cleanText(body.address, 240);
      if (!name || !phone) return sendJson(res, 400, { error: "Name and phone are required." });

      let coupon = null;
      if (body.coupon) {
        const applied = applyCoupon(body.coupon, subtotal);
        if (applied.valid) coupon = { code: applied.code, discount: applied.discount, label: applied.label };
      }
      const amount = Math.max(0, subtotal - (coupon ? coupon.discount : 0));
      const store_ = nearestStore(Number(body.lat), Number(body.lon)) || STORES[0];
      const sessionUser = await getSessionUser(req);
      const hasVehicle = items.some((i) => !["battery", "toys"].includes(i.category));

      const order = {
        id: genId("ORD"),
        kind: "CART",
        status: "CONFIRMED",
        items,
        itemCount: items.reduce((s, i) => s + i.qty, 0),
        product: { id: items[0].id, name: items.length > 1 ? `${items[0].name} + ${items.length - 1} more` : items[0].name, price: items[0].price, category: items[0].category },
        subtotal,
        coupon,
        amount,
        userId: sessionUser ? sessionUser.id : null,
        customer: { name, phone, address },
        store: { id: store_.id, name: store_.name, city: store_.city },
        etaDays: hasVehicle ? 5 : 3,
        createdAt: new Date().toISOString(),
      };
      await store.saveOrder(order);
      return sendJson(res, 201, order);
    }

    // ---- Newsletter signup ----
    if (pathname === "/api/newsletter" && req.method === "POST") {
      const body = await readBody(req);
      const email = cleanText(body.email, 120).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return sendJson(res, 400, { error: "Please enter a valid email address." });
      }
      return sendJson(res, 200, { ok: true, message: "You're subscribed! Watch out for exclusive VoltEdge offers." });
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

      const sessionUser = await getSessionUser(req);
      const qty = kind === "PURCHASE" ? clampNumber(body.qty, 1, 5, 1) : 1;
      const subtotal = kind === "PURCHASE" ? product.price * qty : 0;

      let coupon = null;
      if (kind === "PURCHASE" && body.coupon) {
        const applied = applyCoupon(body.coupon, subtotal);
        if (applied.valid) coupon = { code: applied.code, discount: applied.discount, label: applied.label };
      }
      const amount = Math.max(0, subtotal - (coupon ? coupon.discount : 0));

      const order = {
        id: genId(kind === "TEST_RIDE" ? "RIDE" : "ORD"),
        kind,
        status: kind === "TEST_RIDE" ? "BOOKED" : "CONFIRMED",
        product: { id: product.id, name: product.name, price: product.price, category: product.category },
        color,
        qty,
        subtotal,
        coupon,
        amount,
        userId: sessionUser ? sessionUser.id : null,
        customer: { name, phone, address },
        store: { id: store_.id, name: store_.name, city: store_.city },
        slot: kind === "TEST_RIDE" ? cleanText(body.slot, 40) : "",
        etaDays: kind === "PURCHASE" ? (product.category === "battery" ? 2 : product.category === "toys" ? 3 : 5) : 0,
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
