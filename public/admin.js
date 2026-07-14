"use strict";

/* VoltEdge Admin Dashboard */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const INR = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

let SECRET = sessionStorage.getItem("ve_admin_secret") || "";
const state = { orders: [], reviews: [], products: [], stats: null };

function headers() {
  return { "x-admin-secret": SECRET, "Content-Type": "application/json" };
}
async function api(path, opts) {
  const options = opts || {};
  options.headers = Object.assign(headers(), options.headers || {});
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
  toastTimer = setTimeout(() => (el.hidden = true), 2800);
}
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const CAT_EMOJI = { ebike: "🏍️", escooter: "🛵", eauto: "🛺", ecycle: "🚲", solar: "☀️", cycle: "🚵", battery: "🔋", toys: "🧸" };

/* ---------- login ---------- */
async function tryLogin(secret) {
  SECRET = secret;
  await api("/api/admin/stats"); // throws if wrong
  sessionStorage.setItem("ve_admin_secret", secret);
  $("#loginGate").hidden = true;
  $("#dashboard").hidden = false;
  await loadAll();
}
function logout() {
  sessionStorage.removeItem("ve_admin_secret");
  SECRET = "";
  $("#dashboard").hidden = true;
  $("#loginGate").hidden = false;
  $("#secretInput").value = "";
}

/* ---------- data ---------- */
async function loadAll() {
  try {
    const [stats, orders, reviews, products] = await Promise.all([
      api("/api/admin/stats"),
      api("/api/admin/orders"),
      api("/api/admin/reviews"),
      api("/api/admin/products"),
    ]);
    state.stats = stats;
    state.orders = orders.orders || [];
    state.reviews = reviews.reviews || [];
    state.products = products.products || [];
    renderOverview();
    renderOrders();
    renderReviews();
    renderProducts();
  } catch (err) {
    toast(err.message);
  }
}

/* ---------- overview ---------- */
function renderOverview() {
  const s = state.stats;
  if (!s) return;
  const kpis = [
    { label: "Total orders", value: s.orders, icon: "📦" },
    { label: "Revenue", value: INR(s.revenue), icon: "💰" },
    { label: "Units sold", value: s.unitsSold, icon: "🛍️" },
    { label: "Avg order", value: INR(s.avgOrder), icon: "📈" },
    { label: "Test rides", value: s.testRides, icon: "🛵" },
    { label: "Customers", value: s.customers, icon: "👥" },
    { label: "Reviews", value: s.reviews, icon: "⭐" },
    { label: "Products", value: s.products, icon: "🔋" },
  ];
  $("#kpiGrid").innerHTML = kpis
    .map((k) => `<div class="kpi-card"><div class="kpi-icon">${k.icon}</div><div class="kpi-value">${k.value}</div><div class="kpi-label">${k.label}</div></div>`)
    .join("");

  const statusEntries = Object.entries(s.byStatus || {});
  $("#statusBars").innerHTML = barList(statusEntries);
  const catEntries = Object.entries(s.byCategory || {}).map(([k, v]) => [(CAT_EMOJI[k] || "") + " " + k, v]);
  $("#categoryBars").innerHTML = catEntries.length ? barList(catEntries) : `<div class="muted">No sales yet.</div>`;
}
function barList(entries) {
  if (!entries.length) return `<div class="muted">No data yet.</div>`;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return entries
    .map(
      ([label, v]) =>
        `<div class="bar-item"><div class="bar-label">${escapeHtml(label)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.round((v / max) * 100)}%"></div></div><div class="bar-val">${v}</div></div>`
    )
    .join("");
}

/* ---------- orders ---------- */
function renderOrders() {
  const q = ($("#orderSearch").value || "").toLowerCase().trim();
  let list = state.orders;
  if (q) {
    list = list.filter((o) => {
      const name = (o.customer && o.customer.name) || "";
      const phone = (o.customer && o.customer.phone) || "";
      return o.id.toLowerCase().includes(q) || name.toLowerCase().includes(q) || phone.includes(q);
    });
  }
  if (!list.length) {
    $("#ordersBody").innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">No orders found.</td></tr>`;
    return;
  }
  $("#ordersBody").innerHTML = list
    .map((o) => {
      const isRide = o.kind === "TEST_RIDE";
      const cust = o.customer || {};
      return `<tr>
        <td class="mono">${o.id}</td>
        <td>${CAT_EMOJI[o.product.category] || "⚡"} ${escapeHtml(o.product.name)}</td>
        <td>${escapeHtml(cust.name || "—")}<div class="sub">${escapeHtml(cust.phone || "")}</div></td>
        <td>${isRide ? "Test ride" : "Purchase"}</td>
        <td>${isRide ? "—" : INR(o.amount)}</td>
        <td><span class="status-badge status-${o.status}">${o.status}</span></td>
        <td>${new Date(o.createdAt).toLocaleDateString("en-IN")}</td>
      </tr>`;
    })
    .join("");
}

/* ---------- reviews ---------- */
function renderReviews() {
  const box = $("#reviewModList");
  if (!state.reviews.length) {
    box.innerHTML = `<div class="muted">No customer reviews yet.</div>`;
    return;
  }
  box.innerHTML = state.reviews
    .map(
      (r) => `<div class="mod-review" data-id="${r.id}">
        <div class="mod-rev-main">
          <div class="mod-rev-top">
            <span class="mod-rev-name">${escapeHtml(r.name)}</span>
            <span class="mod-rev-stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
            <span class="mod-rev-prod">on ${escapeHtml(r.productName)}</span>
          </div>
          <div class="mod-rev-text">${escapeHtml(r.text)}</div>
          <div class="sub">${new Date(r.createdAt).toLocaleString("en-IN")}</div>
        </div>
        <button class="del-btn" data-del="${r.id}">🗑 Delete</button>
      </div>`
    )
    .join("");
  box.querySelectorAll("[data-del]").forEach((btn) =>
    btn.addEventListener("click", () => deleteReview(btn.dataset.del))
  );
}
async function deleteReview(id) {
  if (!confirm("Delete this review permanently?")) return;
  try {
    await api("/api/admin/reviews/" + encodeURIComponent(id), { method: "DELETE" });
    state.reviews = state.reviews.filter((r) => r.id !== id);
    renderReviews();
    if (state.stats) { state.stats.reviews = Math.max(0, state.stats.reviews - 1); renderOverview(); }
    toast("Review deleted");
  } catch (err) {
    toast(err.message);
  }
}

/* ---------- products ---------- */
function renderProducts() {
  $("#productsBody").innerHTML = state.products
    .map(
      (p) => `<tr>
        <td class="mono">${p.id}</td>
        <td>${CAT_EMOJI[p.category] || "⚡"} ${escapeHtml(p.name)}</td>
        <td>${p.category}</td>
        <td>${escapeHtml(p.brand)}</td>
        <td>${INR(p.price)}</td>
        <td>${p.stock <= 3 ? `<span class="low-stock">${p.stock} left</span>` : p.stock}</td>
        <td>★ ${p.rating}</td>
      </tr>`
    )
    .join("");
}

/* ---------- tabs ---------- */
function showTab(tab) {
  $$(".admin-tab").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tab));
  $$(".admin-panel").forEach((p) => (p.hidden = p.id !== "tab-" + tab));
}

/* ---------- init ---------- */
function init() {
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#loginMsg");
    msg.textContent = "";
    try {
      await tryLogin($("#secretInput").value);
    } catch (_err) {
      msg.textContent = "Incorrect secret. Please try again.";
    }
  });
  $("#adminNav").addEventListener("click", (e) => {
    const btn = e.target.closest(".admin-tab");
    if (btn) showTab(btn.dataset.tab);
  });
  $("#refreshBtn").addEventListener("click", () => { loadAll(); toast("Refreshed"); });
  $("#logoutBtn").addEventListener("click", logout);
  $("#orderSearch").addEventListener("input", renderOrders);

  if (SECRET) {
    tryLogin(SECRET).catch(() => logout());
  }
}
init();
