"use strict";

/* VoltEdge EV Store — frontend */

const CAT_EMOJI = { ebike: "🏍️", ecycle: "🚲", cycle: "🚵", battery: "🔋" };
const INR = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

const state = {
  view: "shop",
  categories: [],
  products: [],
  filters: { category: "all", q: "", sort: "popular" },
  selected: null,
  selectedColor: "",
  geo: null,
  theme: localStorage.getItem("ve_theme") || "light",
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ---------- utilities ---------- */
async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3200);
}
function emojiFor(p) {
  return CAT_EMOJI[p.category] || "⚡";
}

/* ---------- view switching ---------- */
function showView(view) {
  state.view = view;
  $$(".nav-link").forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
  $$("[data-view-panel]").forEach((p) => (p.hidden = p.dataset.viewPanel !== view));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- catalog ---------- */
async function loadCategories() {
  const { categories } = await api("/api/categories");
  state.categories = categories;
  const chips = $("#catChips");
  const all = `<button class="chip is-active" data-cat="all">🛒 All</button>`;
  chips.innerHTML =
    all +
    categories
      .map((c) => `<button class="chip" data-cat="${c.id}">${c.icon} ${c.name}</button>`)
      .join("");
  chips.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      state.filters.category = chip.dataset.cat;
      loadProducts();
    });
  });
}

async function loadProducts() {
  const { category, q, sort } = state.filters;
  const params = new URLSearchParams({ category, sort });
  if (q) params.set("q", q);
  const { products, count } = await api("/api/products?" + params.toString());
  state.products = products;
  $("#resultMeta").textContent = count
    ? `${count} ${count === 1 ? "product" : "products"} available`
    : "";
  renderProducts(products);
}

function renderProducts(products) {
  const grid = $("#productGrid");
  if (!products.length) {
    grid.innerHTML = `<div class="empty">No products match your search. Try a different filter.</div>`;
    return;
  }
  grid.innerHTML = products
    .map((p) => {
      const spec =
        p.category === "battery"
          ? `<span>${p.battery}</span><span>⏱ ${p.charge}</span>`
          : p.category === "cycle"
          ? `<span>${p.battery}</span>`
          : `<span>🔋 ${p.range}</span><span>⚡ ${p.topSpeed}</span>`;
      return `
      <article class="product-card" data-id="${p.id}">
        <div class="card-emoji">${emojiFor(p)}</div>
        <div class="card-body">
          <span class="card-tag">${p.tag}</span>
          <div class="card-name">${p.name}</div>
          <div class="card-brand">${p.brand}</div>
          <div class="card-spec">${spec}</div>
          <div class="card-price-row">
            <span class="card-price">${INR(p.price)}</span>
            ${p.mrp > p.price ? `<span class="card-mrp">${INR(p.mrp)}</span>` : ""}
            <span class="card-rating">★ ${p.rating}</span>
          </div>
        </div>
      </article>`;
    })
    .join("");
  grid.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", () => openProduct(card.dataset.id));
  });
}

/* ---------- product modal ---------- */
function openProduct(id) {
  const p = state.products.find((x) => x.id === id);
  if (!p) return;
  state.selected = p;
  state.selectedColor = (p.colors && p.colors[0]) || "";
  const save = p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  const specs = [
    ["Range", p.range],
    ["Top speed", p.topSpeed],
    ["Battery", p.battery],
    ["Charge time", p.charge],
    ["Rating", `★ ${p.rating} (${p.reviews})`],
    ["In stock", `${p.stock} units`],
  ].filter(([, v]) => v && v !== "—");

  $("#productModalBody").innerHTML = `
    <div class="pm-emoji">${emojiFor(p)}</div>
    <h2 class="pm-name">${p.name}</h2>
    <div class="pm-brand">${p.brand} · ${state.categories.find((c) => c.id === p.category)?.name || ""}</div>
    <div class="pm-price-row">
      <span class="pm-price">${INR(p.price)}</span>
      ${p.mrp > p.price ? `<span class="pm-mrp">${INR(p.mrp)}</span>` : ""}
      ${save ? `<span class="pm-save">${save}% off</span>` : ""}
    </div>
    <div class="spec-grid">
      ${specs.map(([k, v]) => `<div class="spec-item"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("")}
    </div>
    <p class="pm-desc">${p.desc}</p>
    ${
      p.colors && p.colors.length > 1
        ? `<div class="color-row" id="colorRow">${p.colors
            .map((c, i) => `<button class="color-pill ${i === 0 ? "is-active" : ""}" data-color="${c}">${c}</button>`)
            .join("")}</div>`
        : ""
    }
    <div class="pm-actions">
      <button class="primary-btn" id="buyBtn">Buy now</button>
      ${p.category === "battery" ? "" : `<button class="secondary-btn" id="testRideBtn">Book test ride</button>`}
    </div>`;

  const colorRow = $("#colorRow");
  if (colorRow) {
    colorRow.querySelectorAll(".color-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        colorRow.querySelectorAll(".color-pill").forEach((x) => x.classList.remove("is-active"));
        pill.classList.add("is-active");
        state.selectedColor = pill.dataset.color;
      });
    });
  }
  $("#buyBtn").addEventListener("click", () => openCheckout("PURCHASE"));
  const trBtn = $("#testRideBtn");
  if (trBtn) trBtn.addEventListener("click", () => openCheckout("TEST_RIDE"));

  $("#productModal").hidden = false;
}

/* ---------- checkout ---------- */
function openCheckout(kind) {
  const p = state.selected;
  if (!p) return;
  $("#productModal").hidden = true;
  const isRide = kind === "TEST_RIDE";
  $("#checkoutBody").innerHTML = `
    <h2 class="pm-name">${isRide ? "Book a free test ride" : "Checkout"}</h2>
    <div class="checkout-summary">
      <span class="cs-emoji">${emojiFor(p)}</span>
      <div>
        <div class="cs-name">${p.name}</div>
        <div class="card-brand">${state.selectedColor || p.brand}</div>
      </div>
      <span class="cs-price">${isRide ? "Free" : INR(p.price)}</span>
    </div>
    <form id="checkoutForm">
      <div class="form-field">
        <label>Full name</label>
        <input type="text" id="coName" required placeholder="Your name" />
      </div>
      <div class="form-field">
        <label>Phone number</label>
        <input type="tel" id="coPhone" required placeholder="10-digit mobile" />
      </div>
      ${
        isRide
          ? `<div class="form-field">
               <label>Preferred slot</label>
               <select id="coSlot">
                 <option>Today, 4–6 PM</option>
                 <option>Tomorrow, 10 AM–12 PM</option>
                 <option>Tomorrow, 4–6 PM</option>
                 <option>This weekend</option>
               </select>
             </div>`
          : `<div class="form-field">
               <label>Delivery address</label>
               <textarea id="coAddress" placeholder="Flat, street, area, pincode"></textarea>
             </div>
             <div class="form-field">
               <label>Quantity</label>
               <input type="number" id="coQty" value="1" min="1" max="5" />
             </div>`
      }
      <p class="form-hint">${
        isRide
          ? "We'll bring the vehicle to your nearest VoltEdge store. Allow location for accurate matching."
          : "Demo order — no payment is taken. Delivery from your nearest store."
      }</p>
      <button class="primary-btn block" type="submit">${isRide ? "Confirm booking" : "Place order"}</button>
    </form>`;

  $("#checkoutForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitOrder(kind);
  });
  $("#checkoutModal").hidden = false;
}

async function submitOrder(kind) {
  const p = state.selected;
  const isRide = kind === "TEST_RIDE";
  const payload = {
    productId: p.id,
    kind: isRide ? "testride" : "purchase",
    name: $("#coName").value.trim(),
    phone: $("#coPhone").value.trim(),
    color: state.selectedColor,
  };
  if (isRide) payload.slot = $("#coSlot").value;
  else {
    payload.address = $("#coAddress").value.trim();
    payload.qty = Number($("#coQty").value) || 1;
  }
  if (state.geo) {
    payload.lat = state.geo.lat;
    payload.lon = state.geo.lon;
  }
  const btn = $("#checkoutForm button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Please wait…";
  try {
    const order = await api("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    $("#checkoutModal").hidden = true;
    showConfirmation(order);
  } catch (err) {
    toast(err.message || "Something went wrong");
    btn.disabled = false;
    btn.textContent = isRide ? "Confirm booking" : "Place order";
  }
}

function showConfirmation(order) {
  const isRide = order.kind === "TEST_RIDE";
  $("#productModalBody").innerHTML = `
    <div class="pm-emoji">${isRide ? "📅" : "✅"}</div>
    <h2 class="pm-name">${isRide ? "Test ride booked!" : "Order confirmed!"}</h2>
    <p class="pm-desc">${
      isRide
        ? `Your test ride for <strong>${order.product.name}</strong> is booked.`
        : `Thanks ${order.customer.name.split(" ")[0]}! Your <strong>${order.product.name}</strong> is on the way.`
    }</p>
    <div class="spec-grid">
      <div class="spec-item"><div class="k">Reference</div><div class="v">${order.id}</div></div>
      <div class="spec-item"><div class="k">Store</div><div class="v">${order.store.name}</div></div>
      ${
        isRide
          ? `<div class="spec-item"><div class="k">Slot</div><div class="v">${order.slot}</div></div>`
          : `<div class="spec-item"><div class="k">Amount</div><div class="v">${INR(order.amount)}</div></div>
             <div class="spec-item"><div class="k">Delivery</div><div class="v">${order.etaDays} days</div></div>`
      }
    </div>
    <div class="pm-actions">
      <button class="primary-btn" id="confDone">Done</button>
      <button class="secondary-btn" id="confOrders">View my orders</button>
    </div>`;
  $("#confDone").addEventListener("click", () => ($("#productModal").hidden = true));
  $("#confOrders").addEventListener("click", () => {
    $("#productModal").hidden = true;
    $("#lookupPhone").value = order.customer.phone;
    showView("orders");
    lookupOrders(order.customer.phone);
  });
  $("#productModal").hidden = false;
  toast(isRide ? "Test ride booked" : "Order placed successfully");
}

/* ---------- orders view ---------- */
async function lookupOrders(phone) {
  const list = $("#orderList");
  list.innerHTML = `<div class="empty">Loading…</div>`;
  try {
    const { orders } = await api("/api/orders?phone=" + encodeURIComponent(phone));
    if (!orders.length) {
      list.innerHTML = `<div class="empty">No orders found for this number yet.</div>`;
      return;
    }
    list.innerHTML = orders
      .map((o) => {
        const isRide = o.kind === "TEST_RIDE";
        return `
        <div class="order-card">
          <div class="order-top">
            <span class="order-emoji">${CAT_EMOJI[o.product.category] || "⚡"}</span>
            <div>
              <div class="order-name">${o.product.name}</div>
              <div class="order-id">${o.id}</div>
            </div>
            <span class="status-badge status-${o.status}">${o.status}</span>
          </div>
          <div class="order-meta">
            <span>Type: ${isRide ? "Test ride" : "Purchase"}</span>
            <span>Store: ${o.store.name}</span>
            ${isRide ? `<span>Slot: ${o.slot}</span>` : `<span>Amount: ${INR(o.amount)}</span>`}
            ${isRide ? "" : `<span>Delivery: ${o.etaDays} days</span>`}
            <span>Placed: ${new Date(o.createdAt).toLocaleString("en-IN")}</span>
          </div>
        </div>`;
      })
      .join("");
  } catch (err) {
    list.innerHTML = `<div class="empty">${err.message}</div>`;
  }
}

/* ---------- nearest store ---------- */
function findNearestStore() {
  if (!navigator.geolocation) {
    toast("Location not supported on this device");
    return;
  }
  toast("Finding your nearest store…");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      state.geo = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      try {
        const { stores } = await api(`/api/stores?lat=${state.geo.lat}&lon=${state.geo.lon}`);
        const nearest = stores[0];
        if (nearest) {
          $("#storeStripText").innerHTML = `📍 Nearest store: <strong>${nearest.name}</strong>${
            nearest.distanceKm != null ? ` · ${nearest.distanceKm} km away` : ""
          } · delivery available`;
          $("#storeStrip").hidden = false;
          toast(`Nearest: ${nearest.name}`);
        }
      } catch (_e) {
        toast("Could not load stores");
      }
    },
    () => toast("Location permission denied"),
    { timeout: 8000 }
  );
}

/* ---------- theme ---------- */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  $("#themeBtn").textContent = state.theme === "dark" ? "☀️" : "🌙";
}
function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem("ve_theme", state.theme);
  applyTheme();
}

/* ---------- bindings ---------- */
function bindEvents() {
  $("#topNav").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-link");
    if (btn) showView(btn.dataset.view);
  });
  $("#brandHome").addEventListener("click", (e) => {
    e.preventDefault();
    showView("shop");
  });
  $("#heroShopBtn").addEventListener("click", () => {
    $("#productGrid").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#searchInput").addEventListener("input", (e) => {
    state.filters.q = e.target.value.trim();
    clearTimeout(state._searchTimer);
    state._searchTimer = setTimeout(loadProducts, 250);
  });
  $("#sortSelect").addEventListener("change", (e) => {
    state.filters.sort = e.target.value;
    loadProducts();
  });
  $("#nearStoreBtn").addEventListener("click", findNearestStore);
  $("#themeBtn").addEventListener("click", toggleTheme);
  $("#lookupForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const phone = $("#lookupPhone").value.trim();
    if (phone) lookupOrders(phone);
  });
  $$(".modal [data-close]").forEach((el) =>
    el.addEventListener("click", () => {
      el.closest(".modal").hidden = true;
    })
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") $$(".modal").forEach((m) => (m.hidden = true));
  });
}

/* ---------- init ---------- */
async function init() {
  applyTheme();
  bindEvents();
  try {
    await loadCategories();
    await loadProducts();
  } catch (err) {
    toast("Could not load catalog: " + err.message);
  }
}
document.addEventListener("DOMContentLoaded", init);
