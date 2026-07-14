"use strict";

/* VoltEdge EV Store — frontend */

const CAT_EMOJI = {
  ebike: "🏍️", escooter: "🛵", eauto: "🛺", ecycle: "🚲",
  solar: "☀️", cycle: "🚵", battery: "🔋", toys: "🧸",
};
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
  token: localStorage.getItem("ve_token") || "",
  user: null,
  offers: [],
  marketplaces: {},
  about: null,
  coupon: null,
  cart: JSON.parse(localStorage.getItem("ve_cart") || "[]"),
  wishlist: JSON.parse(localStorage.getItem("ve_wishlist") || "[]"),
  cartCoupon: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ---------- utilities ---------- */
function authHeaders(extra) {
  const h = Object.assign({}, extra || {});
  if (state.token) h["x-auth-token"] = state.token;
  return h;
}
async function api(path, opts) {
  const options = opts || {};
  options.headers = authHeaders(options.headers);
  const res = await fetch(path, options);
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

/* ---------- visuals ---------- */
const CAT_GRADIENT = {
  ebike: ["#0ea5e9", "#1e3a8a"],
  escooter: ["#10b981", "#065f46"],
  eauto: ["#f59e0b", "#b45309"],
  ecycle: ["#22c55e", "#15803d"],
  solar: ["#fbbf24", "#f97316"],
  cycle: ["#8b5cf6", "#5b21b6"],
  battery: ["#ef4444", "#7f1d1d"],
  toys: ["#ec4899", "#9d174d"],
};
function productVisual(p, size) {
  const g = CAT_GRADIENT[p.category] || ["#10b981", "#059669"];
  const cls = size === "lg" ? "pv pv-lg" : "pv";
  return `<div class="${cls}" style="background:linear-gradient(135deg, ${g[0]}, ${g[1]})">
    <span class="pv-emoji">${emojiFor(p)}</span>
    ${p.mrp > p.price ? `<span class="pv-off">${Math.round(((p.mrp - p.price) / p.mrp) * 100)}% OFF</span>` : ""}
  </div>`;
}
function renderHeroArt() {
  const el = $("#heroArt");
  if (!el) return;
  el.innerHTML = `
    <div class="hero-tiles">
      <span style="background:linear-gradient(135deg,#0ea5e9,#1e3a8a)">🏍️</span>
      <span style="background:linear-gradient(135deg,#10b981,#065f46)">🛵</span>
      <span style="background:linear-gradient(135deg,#f59e0b,#b45309)">🛺</span>
      <span style="background:linear-gradient(135deg,#fbbf24,#f97316)">☀️</span>
      <span style="background:linear-gradient(135deg,#ef4444,#7f1d1d)">🔋</span>
      <span style="background:linear-gradient(135deg,#ec4899,#9d174d)">🧸</span>
    </div>`;
}
function renderTrustStrip() {
  const el = $("#trustStrip");
  if (!el) return;
  const items = [
    ["🚚", "Free home delivery", "Same-week across the city"],
    ["🛡️", "Up to 8-yr warranty", "On batteries & vehicles"],
    ["🔒", "Secure checkout", "Safe & simulated demo"],
    ["↩️", "7-day easy returns", "No-questions-asked"],
    ["🏬", "Test-ride hubs", "Touch, ride, then buy"],
  ];
  el.innerHTML = items
    .map((i) => `<div class="trust-item"><span class="trust-ico">${i[0]}</span><div><div class="trust-t">${i[1]}</div><div class="trust-s">${i[2]}</div></div></div>`)
    .join("");
}

/* ---------- reviews (sample, generated from rating) ---------- */
const REVIEW_NAMES = ["Rahul S.", "Priya K.", "Imran A.", "Sneha R.", "Vikram M.", "Ananya P.", "Karthik N.", "Divya L."];
const REVIEW_LINES = [
  "Absolutely love it — worth every rupee!",
  "Great build quality and smooth ride.",
  "Delivery was quick and the team was helpful.",
  "Battery life is better than I expected.",
  "Best value for money in this segment.",
  "My kids/family are super happy with it.",
  "Sturdy, reliable and looks premium.",
  "Would definitely recommend to friends.",
];
function sampleReviews(p) {
  const count = Math.min(3, Math.max(2, Math.round(p.rating)));
  const out = [];
  for (let i = 0; i < count; i++) {
    const idx = (p.name.length + i * 3) % REVIEW_NAMES.length;
    const stars = Math.max(4, Math.round(p.rating) - (i === count - 1 ? 1 : 0));
    out.push({
      name: REVIEW_NAMES[idx],
      stars,
      text: REVIEW_LINES[(p.reviews + i * 2) % REVIEW_LINES.length],
    });
  }
  return out;
}

/* ---------- EMI ---------- */
function emiText(price) {
  if (price < 20000) return "";
  const months = 12;
  const rate = 0.12 / 12;
  const emi = Math.round((price * rate * Math.pow(1 + rate, months)) / (Math.pow(1 + rate, months) - 1));
  return `💳 No-cost EMI from <strong>${INR(emi)}/mo</strong> for 12 months`;
}
function marketBadges(ids) {
  if (!ids || !ids.length) return "";
  const chips = ids
    .map((id) => {
      const m = state.marketplaces[id];
      if (!m) return "";
      return `<span class="mkt-chip" title="Also on ${m.name}">${m.icon} ${m.name}</span>`;
    })
    .join("");
  return chips ? `<div class="mkt-row">${chips}</div>` : "";
}

/* ---------- view switching ---------- */
function showView(view) {
  state.view = view;
  $$(".nav-link").forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
  $$("[data-view-panel]").forEach((p) => (p.hidden = p.dataset.viewPanel !== view));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (view === "offers") renderOffersView();
  if (view === "about") renderAboutView();
  if (view === "wishlist") renderWishlist();
  if (view === "orders" && state.user) {
    $("#lookupPhone").value = state.user.phone || "";
    loadMyOrders();
  }
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
  grid.innerHTML = products.map(productCardHtml).join("");
  wireProductCards(grid);
}

function productCardHtml(p) {
  const spec =
    p.category === "battery"
      ? `<span>${p.battery}</span><span>⏱ ${p.charge}</span>`
      : p.category === "cycle"
      ? `<span>${p.battery}</span>`
      : p.category === "toys"
      ? `<span>👶 ${p.ageRange || "Kids"}</span><span>⚡ ${p.topSpeed}</span>`
      : p.category === "solar"
      ? `<span>☀️ Solar+Pedal</span><span>🔋 ${p.range}</span>`
      : `<span>🔋 ${p.range}</span><span>⚡ ${p.topSpeed}</span>`;
  const wished = state.wishlist.includes(p.id);
  return `
      <article class="product-card" data-id="${p.id}">
        <div class="card-media">
          ${productVisual(p)}
          <button class="wish-btn ${wished ? "is-on" : ""}" data-wish="${p.id}" title="Save to wishlist" aria-label="Wishlist">${wished ? "❤️" : "🤍"}</button>
        </div>
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
          ${marketBadges(p.marketplaces)}
          <button class="add-cart-btn" data-add="${p.id}">🛒 Add to cart</button>
        </div>
      </article>`;
}

function wireProductCards(grid) {
  grid.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-wish]") || e.target.closest("[data-add]")) return;
      openProduct(card.dataset.id);
    });
  });
  grid.querySelectorAll("[data-wish]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleWishlist(btn.dataset.wish);
    })
  );
  grid.querySelectorAll("[data-add]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      addToCart(btn.dataset.add);
    })
  );
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
    ["Motor", p.motor],
    ["Battery", p.battery],
    ["Charge time", p.charge],
    ["Warranty", p.warranty],
    ["Age group", p.ageRange],
    ["Rating", `★ ${p.rating} (${p.reviews})`],
    ["In stock", `${p.stock} units`],
  ].filter(([, v]) => v && v !== "—");

  const powerNote = p.power ? `<div class="pm-power">☀️ ${p.power}</div>` : "";
  const fitsRow = p.fits && p.fits.length
    ? `<div class="pm-fits"><strong>Fits:</strong> ${p.fits.join(" · ")}</div>`
    : "";
  const featureList = p.features && p.features.length
    ? `<ul class="pm-features">${p.features.map((f) => `<li>✓ ${f}</li>`).join("")}</ul>`
    : "";
  const marketRow = marketBadges(p.marketplaces);
  const emi = emiText(p.price);
  const reviews = sampleReviews(p);
  const reviewsHtml = `
    <div class="pm-reviews">
      <div class="pm-reviews-head">
        <span class="pm-rev-score">★ ${p.rating}</span>
        <span class="pm-rev-count">${p.reviews} verified reviews</span>
      </div>
      ${reviews
        .map(
          (r) => `<div class="pm-review">
            <div class="pm-rev-top"><span class="pm-rev-name">${r.name}</span><span class="pm-rev-stars">${"★".repeat(r.stars)}${"☆".repeat(5 - r.stars)}</span></div>
            <div class="pm-rev-text">${r.text}</div>
          </div>`
        )
        .join("")}
    </div>`;
  const wished = state.wishlist.includes(p.id);
  const recommend = state.products.filter((x) => x.category === p.category && x.id !== p.id).slice(0, 3);
  const recommendHtml = recommend.length
    ? `<div class="pm-reco"><h3>You may also like</h3><div class="reco-row">${recommend
        .map((r) => `<div class="reco-card" data-reco="${r.id}">${productVisual(r)}<div class="reco-name">${r.name}</div><div class="reco-price">${INR(r.price)}</div></div>`)
        .join("")}</div></div>`
    : "";

  $("#productModalBody").innerHTML = `
    ${productVisual(p, "lg")}
    <h2 class="pm-name">${p.name}</h2>
    <div class="pm-brand">${p.brand} · ${state.categories.find((c) => c.id === p.category)?.name || ""}</div>
    <div class="pm-price-row">
      <span class="pm-price">${INR(p.price)}</span>
      ${p.mrp > p.price ? `<span class="pm-mrp">${INR(p.mrp)}</span>` : ""}
      ${save ? `<span class="pm-save">${save}% off</span>` : ""}
    </div>
    ${emi ? `<div class="pm-emi">${emi}</div>` : ""}
    ${powerNote}
    <div class="spec-grid">
      ${specs.map(([k, v]) => `<div class="spec-item"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("")}
    </div>
    ${fitsRow}
    <p class="pm-desc">${p.desc}</p>
    ${featureList}
    ${marketRow}
    ${
      p.colors && p.colors.length > 1
        ? `<div class="color-row" id="colorRow">${p.colors
            .map((c, i) => `<button class="color-pill ${i === 0 ? "is-active" : ""}" data-color="${c}">${c}</button>`)
            .join("")}</div>`
        : ""
    }
    <div class="pm-actions">
      <button class="primary-btn" id="buyBtn">Buy now</button>
      <button class="secondary-btn" id="addCartBtn">🛒 Add to cart</button>
      <button class="wish-btn-lg ${wished ? "is-on" : ""}" id="wishToggle">${wished ? "❤️ Saved" : "🤍 Wishlist"}</button>
      ${p.category === "battery" || p.category === "toys" ? "" : `<button class="ghost-btn" id="testRideBtn">Book test ride</button>`}
    </div>
    ${reviewsHtml}
    ${recommendHtml}`;

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
  $("#addCartBtn").addEventListener("click", () => {
    addToCart(p.id, state.selectedColor);
  });
  $("#wishToggle").addEventListener("click", () => {
    toggleWishlist(p.id);
    const on = state.wishlist.includes(p.id);
    const btn = $("#wishToggle");
    btn.classList.toggle("is-on", on);
    btn.textContent = on ? "❤️ Saved" : "🤍 Wishlist";
  });
  $$("#productModalBody [data-reco]").forEach((el) =>
    el.addEventListener("click", () => openProduct(el.dataset.reco))
  );
  const trBtn = $("#testRideBtn");
  if (trBtn) trBtn.addEventListener("click", () => openCheckout("TEST_RIDE"));

  $("#productModal").hidden = false;
}

/* ---------- checkout ---------- */
function openCheckout(kind) {
  const p = state.selected;
  if (!p) return;
  state.coupon = null;
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
        <input type="text" id="coName" required placeholder="Your name" value="${(state.user && state.user.name) || ""}" />
      </div>
      <div class="form-field">
        <label>Phone number</label>
        <input type="tel" id="coPhone" required placeholder="10-digit mobile" value="${(state.user && state.user.phone) || ""}" />
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
             </div>
             <div class="form-field">
               <label>Coupon code (optional)</label>
               <div class="coupon-row">
                 <input type="text" id="coCoupon" placeholder="e.g. FREEDOM15, AMAZON10" />
                 <button type="button" class="secondary-btn" id="applyCouponBtn">Apply</button>
               </div>
               <div class="coupon-hint" id="couponMsg"></div>
             </div>
             <div class="checkout-total" id="checkoutTotal"></div>`
      }
      <p class="form-hint">${
        isRide
          ? "We'll bring the vehicle to your nearest VoltEdge store. Allow location for accurate matching."
          : "Demo order — no payment is taken. Delivery from your nearest store."
      }</p>
      <button class="primary-btn block" type="submit">${isRide ? "Confirm booking" : "Place order"}</button>
    </form>`;

  if (!isRide) {
    renderCheckoutTotal();
    $("#coQty").addEventListener("input", () => {
      state.coupon = null;
      $("#couponMsg").textContent = "";
      renderCheckoutTotal();
    });
    $("#applyCouponBtn").addEventListener("click", applyCheckoutCoupon);
  }
  $("#checkoutForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitOrder(kind);
  });
  $("#checkoutModal").hidden = false;
}

function checkoutSubtotal() {
  const p = state.selected;
  const qty = Number(($("#coQty") || {}).value) || 1;
  return p.price * qty;
}
function renderCheckoutTotal() {
  const el = $("#checkoutTotal");
  if (!el) return;
  const subtotal = checkoutSubtotal();
  const discount = state.coupon ? state.coupon.discount : 0;
  el.innerHTML = `
    <div class="ct-row"><span>Subtotal</span><span>${INR(subtotal)}</span></div>
    ${discount ? `<div class="ct-row ct-disc"><span>Coupon ${state.coupon.code}</span><span>− ${INR(discount)}</span></div>` : ""}
    <div class="ct-row ct-total"><span>Total</span><span>${INR(subtotal - discount)}</span></div>`;
}
async function applyCheckoutCoupon() {
  const code = ($("#coCoupon").value || "").trim();
  const msg = $("#couponMsg");
  if (!code) {
    state.coupon = null;
    msg.textContent = "";
    renderCheckoutTotal();
    return;
  }
  try {
    const result = await api("/api/coupon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, amount: checkoutSubtotal() }),
    });
    state.coupon = { code: result.code, discount: result.discount };
    msg.className = "coupon-hint ok";
    msg.textContent = `✓ ${result.label} — you save ${INR(result.discount)}`;
  } catch (err) {
    state.coupon = null;
    msg.className = "coupon-hint err";
    msg.textContent = err.message;
  }
  renderCheckoutTotal();
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
    if (state.coupon) payload.coupon = state.coupon.code;
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
             ${order.coupon ? `<div class="spec-item"><div class="k">Coupon saved</div><div class="v">− ${INR(order.coupon.discount)}</div></div>` : ""}
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
    renderOrderList(orders);
  } catch (err) {
    list.innerHTML = `<div class="empty">${err.message}</div>`;
  }
}
function renderOrderList(orders) {
  const list = $("#orderList");
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
            ${!isRide && o.coupon ? `<span>Coupon: ${o.coupon.code} (−${INR(o.coupon.discount)})</span>` : ""}
            ${isRide ? "" : `<span>Delivery: ${o.etaDays} days</span>`}
            <span>Placed: ${new Date(o.createdAt).toLocaleString("en-IN")}</span>
          </div>
        </div>`;
    })
    .join("");
}

/* ---------- accounts / auth ---------- */
function updateAccountUI() {
  const btn = $("#accountBtn");
  if (state.user) {
    btn.textContent = "👤 " + (state.user.name || "Account").split(" ")[0];
    btn.title = "Logout of " + state.user.name;
  } else {
    btn.textContent = "👤 Login";
    btn.title = "Login or register";
  }
}
async function loadSession() {
  if (!state.token) return;
  try {
    const { user } = await api("/api/auth/me");
    state.user = user;
  } catch (_e) {
    state.token = "";
    localStorage.removeItem("ve_token");
    state.user = null;
  }
  updateAccountUI();
}
function openAuth(mode) {
  const isLogin = mode !== "register";
  $("#authBody").innerHTML = `
    <div class="pm-emoji">⚡</div>
    <h2 class="pm-name">${isLogin ? "Login to VoltEdge" : "Create your account"}</h2>
    <p class="pm-desc">${isLogin ? "Welcome back! Track orders and check out faster." : "Join VoltEdge to save your details and track every order."}</p>
    <form id="authForm">
      ${
        isLogin
          ? ""
          : `<div class="form-field"><label>Full name</label><input type="text" id="auName" required placeholder="Your name" /></div>
             <div class="form-field"><label>Phone</label><input type="tel" id="auPhone" placeholder="10-digit mobile" /></div>`
      }
      <div class="form-field"><label>Email</label><input type="email" id="auEmail" required placeholder="you@example.com" /></div>
      <div class="form-field"><label>Password</label><input type="password" id="auPass" required placeholder="At least 6 characters" /></div>
      <div class="auth-msg" id="authMsg"></div>
      <button class="primary-btn block" type="submit">${isLogin ? "Login" : "Create account"}</button>
    </form>
    <p class="auth-switch">
      ${isLogin ? "New to VoltEdge?" : "Already have an account?"}
      <button class="link-btn" id="authSwitch" type="button">${isLogin ? "Create an account" : "Login instead"}</button>
    </p>`;
  $("#authSwitch").addEventListener("click", () => openAuth(isLogin ? "register" : "login"));
  $("#authForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitAuth(isLogin ? "login" : "register");
  });
  $("#authModal").hidden = false;
}
async function submitAuth(mode) {
  const isLogin = mode === "login";
  const payload = {
    email: $("#auEmail").value.trim(),
    password: $("#auPass").value,
  };
  if (!isLogin) {
    payload.name = $("#auName").value.trim();
    payload.phone = ($("#auPhone").value || "").trim();
  }
  const btn = $("#authForm button[type=submit]");
  const msg = $("#authMsg");
  btn.disabled = true;
  btn.textContent = "Please wait…";
  try {
    const { token, user } = await api("/api/auth/" + mode, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    state.token = token;
    state.user = user;
    localStorage.setItem("ve_token", token);
    updateAccountUI();
    $("#authModal").hidden = true;
    toast(`Welcome${user.name ? ", " + user.name.split(" ")[0] : ""}! 👋`);
  } catch (err) {
    msg.className = "auth-msg err";
    msg.textContent = err.message;
    btn.disabled = false;
    btn.textContent = isLogin ? "Login" : "Create account";
  }
}
async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch (_e) {
    /* ignore */
  }
  state.token = "";
  state.user = null;
  localStorage.removeItem("ve_token");
  updateAccountUI();
  toast("Logged out");
}
function handleAccountClick() {
  if (state.user) {
    if (confirm(`Logout of ${state.user.name}?`)) logout();
  } else {
    openAuth("login");
  }
}
async function loadMyOrders() {
  const list = $("#orderList");
  list.innerHTML = `<div class="empty">Loading your orders…</div>`;
  try {
    const { orders } = await api("/api/my/orders");
    renderOrderList(orders);
  } catch (_e) {
    list.innerHTML = `<div class="empty">Could not load your orders.</div>`;
  }
}

/* ---------- offers ---------- */
async function loadOffers() {
  try {
    const { offers, marketplaces } = await api("/api/offers");
    state.offers = offers;
    state.marketplaces = marketplaces || {};
    const active = offers[0];
    if (active) {
      $("#offerStripText").innerHTML = `${active.emoji} <strong>${active.title}</strong> — ${active.tagline} · use code <strong>${active.code}</strong>`;
      $("#offerStrip").hidden = false;
    }
  } catch (_e) {
    /* offers are optional */
  }
}
function renderOffersView() {
  const grid = $("#offerGrid");
  grid.innerHTML = state.offers
    .map(
      (o) => `
    <div class="offer-card">
      <div class="offer-emoji">${o.emoji}</div>
      <div class="offer-title">${o.title}</div>
      <div class="offer-tag">${o.tagline}</div>
      <div class="offer-foot">
        <span class="offer-code" data-code="${o.code}">${o.code}</span>
        <span class="offer-until">until ${o.until}</span>
      </div>
    </div>`
    )
    .join("");
  grid.querySelectorAll(".offer-code").forEach((el) =>
    el.addEventListener("click", () => {
      navigator.clipboard?.writeText(el.dataset.code).catch(() => {});
      toast(`Coupon ${el.dataset.code} copied — apply it at checkout`);
    })
  );
  const names = Object.values(state.marketplaces || {}).map((m) => `${m.icon} ${m.name}`).join(" · ");
  $("#marketNote").innerHTML = names
    ? `<strong>Also available on:</strong> ${names}. Use marketplace coupons like <strong>AMAZON10</strong> &amp; <strong>FLIP1500</strong>.`
    : "";
}

/* ---------- about / supply chain ---------- */
async function loadAbout() {
  if (state.about) return;
  try {
    const { about, stores } = await api("/api/about");
    state.about = { about, stores };
  } catch (_e) {
    /* optional */
  }
}
function renderAboutView() {
  if (!state.about) {
    loadAbout().then(() => {
      if (state.view === "about") renderAboutView();
    });
    return;
  }
  const { about, stores } = state.about;
  $("#aboutHeadline").textContent = about.headline;
  $("#aboutIntro").textContent = about.intro;
  $("#pillarGrid").innerHTML = about.pillars
    .map(
      (p) => `
    <div class="pillar-card">
      <div class="pillar-icon">${p.icon}</div>
      <div class="pillar-title">${p.title}</div>
      <div class="pillar-text">${p.text}</div>
    </div>`
    )
    .join("");
  $("#aboutStores").innerHTML = stores
    .map((s) => `<div class="store-pill">🏬 ${s.name}<span>${s.city}</span></div>`)
    .join("");
}

/* ---------- cart ---------- */
function saveCart() {
  localStorage.setItem("ve_cart", JSON.stringify(state.cart));
  updateCartBadge();
}
function updateCartBadge() {
  const badge = $("#cartCount");
  const total = state.cart.reduce((s, i) => s + i.qty, 0);
  badge.textContent = total;
  badge.hidden = total === 0;
}
function findProduct(id) {
  return state.products.find((p) => p.id === id);
}
function addToCart(id, color) {
  const p = findProduct(id);
  if (!p) return;
  const existing = state.cart.find((i) => i.id === id);
  if (existing) existing.qty += 1;
  else state.cart.push({ id, qty: 1, color: color || (p.colors && p.colors[0]) || "" });
  saveCart();
  toast(`${p.name} added to cart 🛒`);
}
function changeCartQty(id, delta) {
  const item = state.cart.find((i) => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) state.cart = state.cart.filter((i) => i.id !== id);
  saveCart();
  renderCart();
}
function removeFromCart(id) {
  state.cart = state.cart.filter((i) => i.id !== id);
  saveCart();
  renderCart();
}
function cartSubtotal() {
  return state.cart.reduce((s, i) => {
    const p = findProduct(i.id);
    return s + (p ? p.price * i.qty : 0);
  }, 0);
}
function openCart() {
  renderCart();
  $("#cartDrawer").hidden = false;
}
function renderCart() {
  const body = $("#cartBody");
  const foot = $("#cartFoot");
  if (!state.cart.length) {
    body.innerHTML = `<div class="empty">Your cart is empty.<br/>Add some electric goodness! ⚡</div>`;
    foot.innerHTML = "";
    return;
  }
  body.innerHTML = state.cart
    .map((i) => {
      const p = findProduct(i.id);
      if (!p) return "";
      return `
      <div class="cart-item">
        ${productVisual(p)}
        <div class="cart-info">
          <div class="cart-name">${p.name}</div>
          <div class="cart-meta">${i.color || p.brand}</div>
          <div class="cart-price">${INR(p.price)}</div>
        </div>
        <div class="cart-qty">
          <button data-cq="dec" data-id="${i.id}">−</button>
          <span>${i.qty}</span>
          <button data-cq="inc" data-id="${i.id}">+</button>
        </div>
        <button class="cart-del" data-crm="${i.id}" title="Remove">🗑️</button>
      </div>`;
    })
    .join("");
  const subtotal = cartSubtotal();
  const discount = state.cartCoupon ? state.cartCoupon.discount : 0;
  foot.innerHTML = `
    <div class="cart-coupon">
      <input type="text" id="cartCouponInput" placeholder="Coupon code" />
      <button class="secondary-btn" id="cartCouponBtn">Apply</button>
    </div>
    <div class="cart-coupon-msg" id="cartCouponMsg"></div>
    <div class="ct-row"><span>Subtotal</span><span>${INR(subtotal)}</span></div>
    ${discount ? `<div class="ct-row ct-disc"><span>Coupon ${state.cartCoupon.code}</span><span>− ${INR(discount)}</span></div>` : ""}
    <div class="ct-row ct-total"><span>Total</span><span>${INR(subtotal - discount)}</span></div>
    <button class="primary-btn block" id="cartCheckoutBtn">Checkout · ${INR(subtotal - discount)}</button>`;

  body.querySelectorAll("[data-cq]").forEach((btn) =>
    btn.addEventListener("click", () => changeCartQty(btn.dataset.id, btn.dataset.cq === "inc" ? 1 : -1))
  );
  body.querySelectorAll("[data-crm]").forEach((btn) =>
    btn.addEventListener("click", () => removeFromCart(btn.dataset.crm))
  );
  $("#cartCouponBtn").addEventListener("click", applyCartCoupon);
  $("#cartCheckoutBtn").addEventListener("click", openCartCheckout);
}
async function applyCartCoupon() {
  const code = ($("#cartCouponInput").value || "").trim();
  const msg = $("#cartCouponMsg");
  if (!code) return;
  try {
    const result = await api("/api/coupon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, amount: cartSubtotal() }),
    });
    state.cartCoupon = { code: result.code, discount: result.discount };
    msg.className = "cart-coupon-msg ok";
    msg.textContent = `✓ You save ${INR(result.discount)}`;
    renderCart();
  } catch (err) {
    state.cartCoupon = null;
    msg.className = "cart-coupon-msg err";
    msg.textContent = err.message;
  }
}
function openCartCheckout() {
  $("#cartDrawer").hidden = true;
  $("#checkoutBody").innerHTML = `
    <h2 class="pm-name">Checkout</h2>
    <div class="checkout-cart-list">
      ${state.cart
        .map((i) => {
          const p = findProduct(i.id);
          return p ? `<div class="cc-row"><span>${emojiFor(p)} ${p.name} × ${i.qty}</span><span>${INR(p.price * i.qty)}</span></div>` : "";
        })
        .join("")}
    </div>
    <form id="cartCheckoutForm">
      <div class="form-field"><label>Full name</label><input type="text" id="ccName" required value="${(state.user && state.user.name) || ""}" /></div>
      <div class="form-field"><label>Phone number</label><input type="tel" id="ccPhone" required value="${(state.user && state.user.phone) || ""}" /></div>
      <div class="form-field"><label>Delivery address</label><textarea id="ccAddress" placeholder="Flat, street, area, pincode"></textarea></div>
      <div class="checkout-total">
        <div class="ct-row"><span>Subtotal</span><span>${INR(cartSubtotal())}</span></div>
        ${state.cartCoupon ? `<div class="ct-row ct-disc"><span>Coupon ${state.cartCoupon.code}</span><span>− ${INR(state.cartCoupon.discount)}</span></div>` : ""}
        <div class="ct-row ct-total"><span>Total</span><span>${INR(cartSubtotal() - (state.cartCoupon ? state.cartCoupon.discount : 0))}</span></div>
      </div>
      <p class="form-hint">Demo order — no payment is taken. Delivery from your nearest store.</p>
      <button class="primary-btn block" type="submit">Place order</button>
    </form>`;
  $("#cartCheckoutForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitCartOrder();
  });
  $("#checkoutModal").hidden = false;
}
async function submitCartOrder() {
  const payload = {
    items: state.cart.map((i) => ({ productId: i.id, qty: i.qty, color: i.color })),
    name: $("#ccName").value.trim(),
    phone: $("#ccPhone").value.trim(),
    address: $("#ccAddress").value.trim(),
  };
  if (state.cartCoupon) payload.coupon = state.cartCoupon.code;
  if (state.geo) {
    payload.lat = state.geo.lat;
    payload.lon = state.geo.lon;
  }
  const btn = $("#cartCheckoutForm button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Please wait…";
  try {
    const order = await api("/api/orders/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    state.cart = [];
    state.cartCoupon = null;
    saveCart();
    $("#checkoutModal").hidden = true;
    showConfirmation(order);
  } catch (err) {
    toast(err.message || "Something went wrong");
    btn.disabled = false;
    btn.textContent = "Place order";
  }
}

/* ---------- wishlist ---------- */
function saveWishlist() {
  localStorage.setItem("ve_wishlist", JSON.stringify(state.wishlist));
  updateWishBadge();
}
function updateWishBadge() {
  const badge = $("#wishCount");
  badge.textContent = state.wishlist.length;
  badge.hidden = state.wishlist.length === 0;
}
function toggleWishlist(id) {
  const p = findProduct(id);
  if (state.wishlist.includes(id)) {
    state.wishlist = state.wishlist.filter((x) => x !== id);
    toast("Removed from wishlist");
  } else {
    state.wishlist.push(id);
    toast(`${p ? p.name : "Item"} saved to wishlist ❤️`);
  }
  saveWishlist();
  // refresh hearts on visible cards
  $$("[data-wish]").forEach((btn) => {
    const on = state.wishlist.includes(btn.dataset.wish);
    btn.classList.toggle("is-on", on);
    btn.textContent = on ? "❤️" : "🤍";
  });
  if (state.view === "wishlist") renderWishlist();
}
function renderWishlist() {
  const grid = $("#wishlistGrid");
  const items = state.wishlist.map(findProduct).filter(Boolean);
  if (!items.length) {
    grid.innerHTML = `<div class="empty">Your wishlist is empty.<br/>Tap the 🤍 on any product to save it here.</div>`;
    return;
  }
  grid.innerHTML = items.map(productCardHtml).join("");
  wireProductCards(grid);
}

/* ---------- newsletter ---------- */
async function submitNewsletter(e) {
  e.preventDefault();
  const email = $("#newsEmail").value.trim();
  const msg = $("#newsMsg");
  try {
    const result = await api("/api/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    msg.className = "news-msg ok";
    msg.textContent = result.message;
    $("#newsEmail").value = "";
  } catch (err) {
    msg.className = "news-msg err";
    msg.textContent = err.message;
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
  $("#accountBtn").addEventListener("click", handleAccountClick);
  $("#themeBtn").addEventListener("click", toggleTheme);
  $("#offerStrip").addEventListener("click", () => showView("offers"));
  $("#cartBtn").addEventListener("click", openCart);
  $("#wishlistBtn").addEventListener("click", () => showView("wishlist"));
  $("#newsForm").addEventListener("submit", submitNewsletter);
  $$(".drawer [data-close]").forEach((el) =>
    el.addEventListener("click", () => (el.closest(".drawer").hidden = true))
  );
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
    if (e.key === "Escape") {
      $$(".modal").forEach((m) => (m.hidden = true));
      $$(".drawer").forEach((d) => (d.hidden = true));
    }
  });
}

/* ---------- init ---------- */
async function init() {
  applyTheme();
  bindEvents();
  updateAccountUI();
  renderHeroArt();
  renderTrustStrip();
  updateCartBadge();
  updateWishBadge();
  try {
    await loadCategories();
    await loadProducts();
    await loadOffers();
    await loadSession();
  } catch (err) {
    toast("Could not load catalog: " + err.message);
  }
}
document.addEventListener("DOMContentLoaded", init);
