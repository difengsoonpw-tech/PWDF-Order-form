/* =========================================
   PWDF CUSTOMER ORDERING PAGE — Stage 4 rebuild
   - Products load live from the Google Sheet (via the public API),
     so anything staff add/edit/hide/price in the portal shows up here
     immediately, with no separate deploy step.
   - No price is ever shown while browsing. A price only appears once an
     item is in the customer's own cart, and it's fetched fresh from the
     server for exactly those items — the full wholesale price list is
     never downloaded to the browser.
   ========================================= */

const DECORATION_PRICE_TEXT = "Decoration + RM 10.50";

/* These three mirror constants of the same name in PWDF-Order-API.gs. They let
   the browser add up a cart it has already been quoted prices for, instead of
   asking the server again every time someone taps + or -. If you ever change
   the surcharge or the item cap in the .gs, change it here too — the server
   stays the authority (it re-prices the whole cart before the order is
   reviewed and again when it is saved), but keeping these in step means the
   figure on screen never jumps when the server's answer arrives. */
const DECORATION_SURCHARGE_AMOUNT = 10.50;
const CART_CALC_MAX_ITEMS = 150;
const CART_MAX_QTY = 100000;
const ORDER_POLICY_TEXT = `
⚠ IMPORTANT:
This order is considered CONFIRMED upon submission.

• Amendments are only allowed before the Sales Advisor confirms your order.
• No changes are allowed after the order has been submitted.
`;

function goHome() {
  window.location.href = "index.html";
}

/* ---------- state ---------- */
let ALL_PRODUCTS = [];      // flat array from the API: {code,name,category,choice,addon,photo}
let CATEGORY_LIST = [];     // [{name, count}]
let CART = new Map();       // key `${code}::${choice}` -> {code,name,category,choice,addon,qty}
let CURRENT_CATEGORY = "";  // "" = All products
let CURRENT_SEARCH = "";
let CURRENT_ORDER_REF = null;
let LAST_PRICING = { total: 0, byKey: {}, partial: false }; // key -> {unitPrice, lineTotal}
let pricingDebounceHandle = null;

/* Unit prices the server has already quoted, remembered by product code so
   the same question is never asked twice. Deliberately in memory only — it is
   never written to localStorage, so closing the tab forgets every price and a
   shared laptop keeps nothing on disk. */
let PRICE_MEMO = new Map();
/* The exact cart the server last priced for us, so re-opening the review
   popup on an unchanged cart doesn't fire the same request again. */
let LAST_VERIFIED_SIGNATURE = "";

/* ---------- DOM ---------- */
const searchInput = document.getElementById("searchInput");
const categoryRail = document.getElementById("categoryRail");
const categoryStrip = document.getElementById("categoryStrip");
const listTitle = document.getElementById("listTitle");
const listCount = document.getElementById("listCount");
const productList = document.getElementById("productList");
const orderLines = document.getElementById("orderLines");
const orderSub = document.getElementById("orderSub");
const orderTotal = document.getElementById("orderTotal");
const reviewBtnDesktop = document.getElementById("reviewBtnDesktop");
const mobileOrderBar = document.getElementById("mobileOrderBar");
const mobCount = document.getElementById("mobCount");
const mobTotal = document.getElementById("mobTotal");
const reviewBtnMobile = document.getElementById("reviewBtnMobile");
const summaryPopup = document.getElementById("summaryPopup");
const popupSummary = document.getElementById("popupSummary");
const popupTotal = document.getElementById("popupTotal");
const customerName = document.getElementById("customerName");
const brandName = document.getElementById("brandName");
const contactNumber = document.getElementById("contactNumber");

/* Customers are no longer asked when or where they want delivery.
   They can't know which day their address is served on, and a wrong guess
   turned into a missed delivery — so Sales sets the delivery date in the
   dashboard afterwards, guided by the BC_CUSTOMERS area lookup. Nothing
   about delivery areas is fetched here any more, which also means the
   customer list is no longer reachable from a customer's browser at all. */

function formatMoney(n) {
  return "RM " + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cartKey(code, choice) {
  return code + "::" + (choice || "");
}

function cartQtyTotal() {
  let total = 0;
  CART.forEach(line => { total += line.qty; });
  return total;
}

/* ---------- load products ----------

   The menu used to appear only after a round trip to Google — every visit,
   every time. Now the last known menu is kept in this browser and shown
   immediately, while a fresh copy is fetched in the background and swapped
   in only if something actually changed.

   ONE RULE MATTERS MORE THAN THE SPEED: a staff browser must never write
   this cache. Staff receive wholesale prices in their copy of the product
   list. Saving that to disk would leave the entire price list sitting in a
   shared laptop, outliving the staff session, ready to be rendered to
   whoever opens the page next. Hence the getStaffToken() guard on both the
   read and the write. */
const PRODUCT_CACHE_KEY = "pwdf.products.v1";
const PRODUCT_CACHE_SCHEMA = 1;              // bump when the row markup changes
const PRODUCT_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

let PRODUCTS_SIGNATURE = "";                 // the last payload we rendered
let PENDING_PRODUCTS = null;                 // fresh data held back mid-typing

function readCachedProducts() {
  if (getStaffToken()) return null;          // never serve a staff-priced cache
  try {
    const box = JSON.parse(localStorage.getItem(PRODUCT_CACHE_KEY) || "null");
    if (!box || box.v !== PRODUCT_CACHE_SCHEMA) return null;
    if (!Array.isArray(box.products) || !box.products.length) return null;
    if (Date.now() - Number(box.savedAt || 0) > PRODUCT_CACHE_MAX_AGE_MS) return null;
    // Belt and braces: if a price ever appears in here, distrust the whole thing.
    if (box.products.some(p => p && "price" in p)) return null;
    return box.products;
  } catch (err) {
    return null;                             // private mode, cleared storage, anything
  }
}

function writeCachedProducts(products) {
  if (getStaffToken()) return;               // never persist wholesale prices
  try {
    localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify({
      v: PRODUCT_CACHE_SCHEMA, savedAt: Date.now(), products: products
    }));
  } catch (err) {
    /* storage full or unavailable — the cache is an optimisation, not a need */
  }
}

/* Applies fresh data that was held back because the customer was typing. */
function drainPendingProducts() {
  if (!PENDING_PRODUCTS) return;
  const list = PENDING_PRODUCTS;
  PENDING_PRODUCTS = null;
  applyProducts(list);
}

function applyProducts(products) {
  ALL_PRODUCTS = products;
  // Stamp each product with its position so a row can point back at it.
  ALL_PRODUCTS.forEach((p, i) => { p._i = i; });
  buildCategoryList();
  renderCategoryUI();
  renderProductList();
}

async function loadProducts() {
  if (!productList) return;                  // not the ordering page

  const cached = readCachedProducts();
  let showing = false;
  if (cached) {
    applyProducts(cached);
    showing = true;
  } else {
    productList.innerHTML = `<div class="no-results">Loading products…</div>`;
  }

  const result = await getFromGoogleApi({ action: "getproducts" });
  if (!result || result.success !== true || !Array.isArray(result.products)) {
    // If a cached menu is already on screen, leave it there — a customer with
    // a patchy connection can still order from yesterday's menu.
    if (!showing) {
      productList.innerHTML = `<div class="no-results">Could not load the menu. Please refresh the page, or check your connection.</div>`;
      if (listCount) listCount.textContent = "";
    }
    return;
  }

  // Compare and store BEFORE applyProducts stamps _i onto each product,
  // otherwise every refresh would look like a change.
  const signature = JSON.stringify(result.products);
  writeCachedProducts(result.products);
  if (showing && signature === PRODUCTS_SIGNATURE) return;   // nothing changed
  PRODUCTS_SIGNATURE = signature;

  // Don't rebuild the list out from under someone who is mid-interaction;
  // hold it until they next search or change category.
  if (showing && productList.contains(document.activeElement)) {
    PENDING_PRODUCTS = result.products;
    return;
  }
  applyProducts(result.products);
}

function buildCategoryList() {
  const order = [];
  const counts = {};
  ALL_PRODUCTS.forEach(p => {
    const cat = (p.category || "Other").trim() || "Other";
    if (!(cat in counts)) { counts[cat] = 0; order.push(cat); }
    counts[cat]++;
  });
  CATEGORY_LIST = order.map(name => ({ name, count: counts[name] }));
}

/* ---------- category rail (desktop) + strip (mobile) ---------- */
function renderCategoryUI() {
  const totalCount = ALL_PRODUCTS.length;

  let railHtml = `<span class="rail-label">CATEGORIES</span>`;
  railHtml += `<div class="cat-row ${CURRENT_CATEGORY === "" ? "active" : ""}" data-cat=""><span>All products</span><span class="cat-count">${totalCount}</span></div>`;
  CATEGORY_LIST.forEach(c => {
    railHtml += `<div class="cat-row ${CURRENT_CATEGORY === c.name ? "active" : ""}" data-cat="${escapeHtml(c.name)}"><span>${escapeHtml(titleCase(c.name))}</span><span class="cat-count">${c.count}</span></div>`;
  });
  // Both containers are optional — the order editor has a strip but no rail.
  if (categoryRail) {
    categoryRail.innerHTML = railHtml;
    categoryRail.querySelectorAll("[data-cat]").forEach(el => {
      el.addEventListener("click", () => setCategory(el.dataset.cat));
    });
  }

  let stripHtml = `<div class="cat-chip ${CURRENT_CATEGORY === "" ? "active" : ""}" data-cat="">All (${totalCount})</div>`;
  CATEGORY_LIST.forEach(c => {
    stripHtml += `<div class="cat-chip ${CURRENT_CATEGORY === c.name ? "active" : ""}" data-cat="${escapeHtml(c.name)}">${escapeHtml(titleCase(c.name))} (${c.count})</div>`;
  });
  if (categoryStrip) {
    categoryStrip.innerHTML = stripHtml;
    categoryStrip.querySelectorAll("[data-cat]").forEach(el => {
      el.addEventListener("click", () => setCategory(el.dataset.cat));
    });
  }
}

function titleCase(s) {
  return String(s || "").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function setCategory(cat) {
  CURRENT_CATEGORY = cat || "";
  drainPendingProducts();
  renderCategoryUI();
  renderProductList();
}

/* ---------- product list ---------- */
function getFilteredProducts() {
  const q = CURRENT_SEARCH.trim().toLowerCase();
  return ALL_PRODUCTS.filter(p => {
    if (CURRENT_CATEGORY && (p.category || "Other").trim() !== CURRENT_CATEGORY) return false;
    if (q) {
      const hay = ((p.name || "") + " " + (p.code || "")).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}

/* Builds one row's markup as a string.
   Every row carries two identifying attributes:
     data-idx  — where this product sits in ALL_PRODUCTS, so a click can find
                 it again without hunting through the array.
     data-code — the same product's code, checked on every click. If the
                 catalogue is swapped out by a background refresh between a
                 render and a tap, the codes won't line up and the tap is
                 ignored rather than quietly adding the wrong product. */
function productRowHtml(p) {
  const choices = (p.choice || "").split("/").map(c => c.trim()).filter(Boolean);

  /* Show the option this product is actually in the cart under, not just the
     first one in the list. Without this, a cake added as "90 CUT" redraws as
     "45 CUT" with a quantity of 0 the moment the list is re-rendered — on a
     search, a category change, or a background catalogue refresh — and on the
     staff Edit page a whole saved order looks empty. */
  let selectedChoice = choices.length ? choices[0] : "";
  let qty = 0;
  const candidates = choices.length ? choices : [""];
  for (let i = 0; i < candidates.length; i++) {
    const line = CART.get(cartKey(p.code, candidates[i]));
    if (line && line.qty > 0) {
      selectedChoice = candidates[i];
      qty = line.qty;
      break;
    }
  }

  // Only ever request a photo that is a real web address (the ones uploaded
  // via the staff portal's Drive photo tool). Older leftover values in the
  // sheet like "MASTER_LIST_PHOTO/DP-C0008.JPG" are local filenames from the
  // old system, not real links — requesting hundreds of those at once is
  // what was making the whole page look stuck on "Loading".
  const hasRealPhoto = /^https?:\/\//i.test(p.photo || "");

  return `<div class="product-row${qty > 0 ? " has-qty" : ""}" data-idx="${p._i}" data-code="${escapeHtml(p.code)}">
      ${hasRealPhoto
        ? `<img class="product-thumb" src="${escapeHtml(p.photo)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=&quot;product-thumb placeholder&quot;>no photo</div>'">`
        : `<div class="product-thumb placeholder">no photo</div>`}
      <div class="product-info">
        <div class="p-name">${escapeHtml(p.name || "(unnamed)")}</div>
        <div class="p-meta">${escapeHtml(p.code)}</div>
      </div>
      <div class="opt-and-stepper">
        ${choices.length
          ? `<select class="opt-select" data-act="choice">${choices.map(c => `<option value="${escapeHtml(c)}"${c === selectedChoice ? " selected" : ""}>${escapeHtml(c)}</option>`).join("")}</select>`
          : `<span class="no-opt">—</span>`}
        <div class="stepper">
          <button type="button" class="minus" data-act="minus">–</button>
          <input type="number" class="qty-val" data-act="qty" min="0" value="${qty}" inputmode="numeric">
          <button type="button" class="plus" data-act="plus">+</button>
        </div>
      </div>
    </div>`;
}

function renderProductList() {
  if (!productList) return;
  const filtered = getFilteredProducts();
  if (listTitle) listTitle.textContent = CURRENT_CATEGORY ? titleCase(CURRENT_CATEGORY) : "All products";
  if (listCount) listCount.textContent = `${filtered.length} item${filtered.length === 1 ? "" : "s"}`;

  if (!filtered.length) {
    productList.innerHTML = `<div class="no-results">No products found. Try another search term.</div>`;
    return;
  }

  // One string, one parse, one layout — instead of building 341 elements and
  // appending them into the live page one at a time. Quantities are baked
  // into the markup, so there's no second pass to sync the steppers either.
  productList.innerHTML = filtered.map(productRowHtml).join("");
}

/* ---------- product row interactions ----------
   Two listeners on the container handle every row, instead of four listeners
   per row (about 1,360 of them for the full catalogue). Because the container
   itself is never replaced, these survive every re-render and never need
   re-attaching. */
function rowContext(target) {
  const row = target.closest(".product-row");
  if (!row) return null;
  const p = ALL_PRODUCTS[Number(row.dataset.idx)];
  // The code check is the guard against a stale row: if the catalogue changed
  // underneath us, do nothing rather than act on the wrong product.
  if (!p || String(p.code) !== row.dataset.code) return null;
  const select = row.querySelector(".opt-select");
  return { row: row, product: p, choice: select ? select.value : "" };
}

function syncRowQty(ctx) {
  const line = CART.get(cartKey(ctx.product.code, ctx.choice));
  const qty = line ? line.qty : 0;
  const input = ctx.row.querySelector(".qty-val");
  if (input) input.value = qty;
  ctx.row.classList.toggle("has-qty", qty > 0);
}

function applyRowQty(ctx, newQty) {
  // Deliberately routed through setCartQty so the decoration surcharge
  // prompt and the pricing refresh keep working exactly as before.
  setCartQty(ctx.product, ctx.choice, Math.max(0, Math.floor(Number(newQty) || 0)));
  syncRowQty(ctx);
}

function onProductListClick(e) {
  const button = e.target.closest("button[data-act]");
  if (!button) return;
  const ctx = rowContext(button);
  if (!ctx) return;
  const line = CART.get(cartKey(ctx.product.code, ctx.choice));
  const current = line ? line.qty : 0;
  applyRowQty(ctx, button.dataset.act === "plus" ? current + 1 : current - 1);
}

function onProductListChange(e) {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const ctx = rowContext(el);
  if (!ctx) return;
  if (el.dataset.act === "qty") applyRowQty(ctx, el.value);
  else if (el.dataset.act === "choice") syncRowQty(ctx);
}

/* ---------- cart ---------- */
function decorationApplies(category, choice) {
  if (!category || !choice) return false;
  if (category === "BLOCK CAKE" && choice.indexOf("45") !== -1) return true;
  if (category === "SLAB CAKE" && choice.indexOf("90") !== -1) return true;
  return false;
}

function setCartQty(product, choice, qty) {
  const key = cartKey(product.code, choice);
  if (qty <= 0) {
    CART.delete(key);
  } else {
    let line = CART.get(key);
    if (!line) {
      let addon = "";
      if (decorationApplies(product.category, choice)) {
        if (confirm(`Add ${DECORATION_PRICE_TEXT}?`)) addon = DECORATION_PRICE_TEXT;
      }
      line = { code: product.code, name: product.name, category: product.category, choice: choice || "", addon, qty: 0 };
      CART.set(key, line);
    }
    line.qty = qty;
  }
  refreshCartUI();
  schedulePricingRefresh();
}

function removeCartLine(key) {
  CART.delete(key);
  refreshCartUI();
  schedulePricingRefresh();
  renderProductList(); // keeps visible steppers in sync if the removed line is on screen
}

function refreshCartUI() {
  const count = cartQtyTotal();
  const hasItems = count > 0;
  reviewBtnDesktop.disabled = !hasItems;
  reviewBtnMobile.disabled = !hasItems;
  orderSub.textContent = `${count} item${count === 1 ? "" : "s"}`;
  mobCount.textContent = `${count} item${count === 1 ? "" : "s"}`;
  renderOrderPanel();
  // Lets a page that reuses this renderer (the staff Edit page) keep its own
  // extra bits of UI in step without having to patch this function.
  if (typeof window.PWDF_ON_CART_CHANGE === "function") window.PWDF_ON_CART_CHANGE();
}

function renderOrderPanel() {
  if (!CART.size) {
    orderLines.innerHTML = `<div class="order-empty">Your order is empty. Add items from the list to get started.</div>`;
    orderTotal.textContent = formatMoney(0);
    mobTotal.textContent = formatMoney(0);
    return;
  }
  let html = "";
  CART.forEach((line, key) => {
    const pricing = LAST_PRICING.byKey[key];
    const amt = pricing ? formatMoney(pricing.lineTotal) : "…";
    html += `
      <div class="order-line">
        <div>
          <div class="ol-name">${escapeHtml(line.name)}${line.choice ? ` (${escapeHtml(line.choice)})` : ""}</div>
          <div class="ol-meta">${line.qty} × ${pricing ? formatMoney(pricing.unitPrice) : "…"}</div>
        </div>
        <span class="ol-amt">${amt}</span>
      </div>
    `;
  });
  orderLines.innerHTML = html;
  // While any line is still unpriced the running total would be short by that
  // line, so show "…" rather than a number that is about to change.
  const totalText = LAST_PRICING.partial ? "…" : formatMoney(LAST_PRICING.total);
  orderTotal.textContent = totalText;
  mobTotal.textContent = totalText;
}

/* ---------- live pricing (fetched only for what's in the cart) ---------- */
function buildCartItemsPayload() {
  const keys = [];
  const items = [];
  CART.forEach((line, key) => {
    keys.push(key);
    items.push({ code: line.code, qty: line.qty, category: line.category, choice: line.choice, addon: line.addon });
  });
  return { keys, items };
}

/* A short fingerprint of the cart as it stands: every line's key, quantity and
   whether the decoration add-on is on it — i.e. exactly the things that can
   change the total. Sorted so the same cart always fingerprints the same way
   regardless of the order items were added in. */
function cartSignature() {
  const parts = [];
  CART.forEach((line, key) => {
    parts.push(key + "|" + line.qty + "|" + (line.addon ? "1" : "0"));
  });
  return parts.sort().join(";");
}

/* Adds the cart up using prices the server has already given us, applying the
   same clamp and the same decoration rule the server applies, so the figure
   matches to the cent.

   `complete` is false when even one line can't be worked out here — a product
   whose price we've never been quoted, or a cart bigger than the server will
   price in one go. In that case the caller must ask the server rather than
   show a total that is quietly missing a line. */
function computeLocalPricing() {
  const byKey = {};
  let total = 0;
  let complete = CART.size <= CART_CALC_MAX_ITEMS;

  CART.forEach((line, key) => {
    if (!PRICE_MEMO.has(line.code)) {
      complete = false;
      return;
    }
    const unitPrice = PRICE_MEMO.get(line.code);
    const qty = Math.max(0, Math.min(CART_MAX_QTY, Math.floor(Number(line.qty) || 0)));
    let lineTotal = unitPrice * qty;
    if (line.addon && decorationApplies(line.category, line.choice)) {
      lineTotal += DECORATION_SURCHARGE_AMOUNT * qty;
    }
    byKey[key] = { unitPrice: unitPrice, lineTotal: lineTotal };
    total += lineTotal;
  });

  return { total: total, byKey: byKey, complete: complete };
}

/* Show what we can work out right now. When a line is still unpriced the
   panel shows "…" for that line and for the total, so an incomplete figure is
   never mistaken for the real one. */
function applyLocalPricing(local) {
  LAST_PRICING = { total: local.total, byKey: local.byKey, partial: !local.complete };
  renderPricingViews();
  return local;
}

/* Redraw everywhere a price is shown. The review popup is only redrawn while
   it is actually open, so a late-arriving price doesn't rebuild a hidden
   panel — or, worse, wipe out the row the customer is typing a quantity into. */
function renderPricingViews() {
  renderOrderPanel();
  if (summaryPopup && summaryPopup.style.display === "flex") renderPopupCart();
}

/* Counts pricing requests so a slow earlier one can't land after a newer
   one and overwrite the total with a figure for a cart the customer has
   since changed. */
let pricingSeq = 0;

async function fetchCartPricing() {
  const { keys, items } = buildCartItemsPayload();
  if (!items.length) {
    LAST_PRICING = { total: 0, byKey: {}, partial: false };
    LAST_VERIFIED_SIGNATURE = "";
    return LAST_PRICING;
  }
  const seq = ++pricingSeq;
  const signature = cartSignature();
  const result = await postToGoogleApi({ action: "calculatecart", items });
  if (seq !== pricingSeq) return LAST_PRICING;   // superseded while in flight
  if (!result || result.success !== true || !Array.isArray(result.items)) {
    return LAST_PRICING; // keep the last known-good figures rather than showing something broken
  }
  const byKey = {};
  result.items.forEach((it, i) => {
    const key = keys[i];
    if (key) byKey[key] = { unitPrice: it.unitPrice, lineTotal: it.lineTotal };
    // Remember the unit price against its code. Every later quantity change
    // for this product is then pure arithmetic we can do here, instantly.
    if (it && it.code) PRICE_MEMO.set(it.code, Number(it.unitPrice) || 0);
  });
  LAST_PRICING = { total: result.total, byKey: byKey, partial: false };
  LAST_VERIFIED_SIGNATURE = signature;
  return LAST_PRICING;
}

/* Called on every cart change.

   The common case — changing the quantity of something already in the cart —
   needs no server at all, because we were quoted that product's unit price
   when it was first added. The total updates on the same tap.

   A product we've never priced is the only thing that needs asking, and that
   happens once per product, not once per tap. The short timer just lets a
   quick burst of additions share a single request. */
function schedulePricingRefresh() {
  const local = applyLocalPricing(computeLocalPricing());
  if (local.complete) {
    if (pricingDebounceHandle) {
      clearTimeout(pricingDebounceHandle);
      pricingDebounceHandle = null;
    }
    return;
  }
  if (pricingDebounceHandle) clearTimeout(pricingDebounceHandle);
  pricingDebounceHandle = setTimeout(async () => {
    pricingDebounceHandle = null;
    await fetchCartPricing();
    renderPricingViews();
  }, 120);
}

/* Get the server's own figure for the cart as it stands, cancelling any
   request that was already queued. Used before the customer reviews and
   submits, so what they sign off on is the server's number and not ours.
   Skipped only when the server has already priced this exact cart. */
async function flushPricingRefresh() {
  if (pricingDebounceHandle) {
    clearTimeout(pricingDebounceHandle);
    pricingDebounceHandle = null;
  }
  if (CART.size && cartSignature() === LAST_VERIFIED_SIGNATURE && !LAST_PRICING.partial) {
    renderPricingViews();
    return LAST_PRICING;
  }
  await fetchCartPricing();
  renderPricingViews();
  return LAST_PRICING;
}

/* Only price if the figure on screen isn't already the server's. Used at
   submit time, where the review popup has almost always priced it already. */
async function ensurePricingCurrent() {
  if (!CART.size) return;
  if (pricingDebounceHandle || LAST_PRICING.partial || cartSignature() !== LAST_VERIFIED_SIGNATURE) {
    await flushPricingRefresh();
  }
}

/* ---------- review / submit popup ---------- */
async function openOrderReview() {
  if (!CART.size) {
    alert("Your order is empty.");
    return;
  }
  CURRENT_ORDER_REF = CURRENT_ORDER_REF || generateOrderRef();
  reviewBtnDesktop.disabled = true;
  reviewBtnMobile.disabled = true;
  await flushPricingRefresh(); // accurate figure now, and cancels the queued one
  reviewBtnDesktop.disabled = false;
  reviewBtnMobile.disabled = false;
  // The only way this is still true is that the server couldn't be reached,
  // so we don't know the price of at least one line. Better to say so than to
  // show a total that is quietly short.
  if (LAST_PRICING.partial) {
    alert("We couldn't get the prices for your order just now.\nPlease check your connection and tap Review again.");
    return;
  }
  renderPopupCart();
  summaryPopup.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function renderPopupCart() {
  if (!CART.size) {
    popupSummary.innerHTML = `<div class="order-empty">Your cart is empty.</div>`;
    popupTotal.textContent = formatMoney(0);
    return;
  }
  let html = "";
  CART.forEach((line, key) => {
    const pricing = LAST_PRICING.byKey[key] || { unitPrice: 0, lineTotal: 0 };
    html += `
      <div class="cart-line" data-key="${escapeHtml(key)}">
        <div>
          <div class="cl-name">${escapeHtml(line.name)}${line.choice ? ` (${escapeHtml(line.choice)})` : ""}</div>
          ${line.addon ? `<div class="cl-meta">${escapeHtml(line.addon)}</div>` : ""}
          <div class="cl-meta">${formatMoney(pricing.unitPrice)} each</div>
        </div>
        <div class="cart-line-controls">
          <input type="number" min="1" value="${line.qty}" class="popup-qty">
          <span class="cl-amt">${formatMoney(pricing.lineTotal)}</span>
          <button type="button" class="remove-line-btn">Remove</button>
        </div>
      </div>
    `;
  });
  popupSummary.innerHTML = html;
  popupTotal.textContent = LAST_PRICING.partial ? "…" : formatMoney(LAST_PRICING.total);

  popupSummary.querySelectorAll(".cart-line").forEach(el => {
    const key = el.dataset.key;
    const line = CART.get(key);
    if (!line) return;
    // Both of these re-price from the codes we already hold, so the popup
    // total moves on the same tap. The server still has the last word: the
    // submit buttons call ensurePricingCurrent(), which notices the cart has
    // changed since the server last saw it and re-prices once before saving.
    el.querySelector(".popup-qty").addEventListener("change", (e) => {
      const qty = Math.max(1, Math.floor(Number(e.target.value) || 1));
      line.qty = qty;
      refreshCartUI();
      schedulePricingRefresh();
      renderPopupCart();
      renderProductList();
    });
    el.querySelector(".remove-line-btn").addEventListener("click", () => {
      removeCartLine(key); // queues its own refresh
      renderPopupCart();
    });
  });
}

function closeSummary() {
  summaryPopup.style.display = "none";
  document.body.style.overflow = "auto";
}

/* ---------- build the outgoing message ---------- */
function buildText() {
  if (!customerName.value || !brandName.value || !contactNumber.value) {
    alert("Please fill in Customer Name, Brand Name and Contact Number.");
    return null;
  }
  // Never write a total into the order text while a line is still unpriced.
  if (LAST_PRICING.partial) {
    alert("We couldn't get the prices for your order just now.\nPlease check your connection and try again.");
    return null;
  }
  CURRENT_ORDER_REF = CURRENT_ORDER_REF || generateOrderRef();

  let text = `✅ ORDER RECEIVED\n\nOrder Ref: ${CURRENT_ORDER_REF}\n\nCustomer: ${customerName.value}\nBrand: ${brandName.value}\nContact: ${contactNumber.value}\n\nITEMS:\n`;

  CART.forEach((line, key) => {
    const pricing = LAST_PRICING.byKey[key] || { lineTotal: 0 };
    text += `${line.qty} x ${line.name}${line.choice ? ` (${line.choice})` : ""}${line.addon ? ` - ${line.addon}` : ""} | ${formatMoney(pricing.lineTotal)}\n`;
  });

  text += `\n-------------------------\nTOTAL PRICE (indicative): ${formatMoney(LAST_PRICING.total)}\n`;
  text += `\n📌 Our team will confirm your delivery date and come back to you shortly.\n`;
  text += `\n${ORDER_POLICY_TEXT}`;
  return text;
}

async function saveOrderToGoogleSheet() {
  const orderRef = CURRENT_ORDER_REF || generateOrderRef();
  CURRENT_ORDER_REF = orderRef;

  const items = [];
  CART.forEach(line => {
    items.push({
      code: line.code,
      name: line.name,
      qty: line.qty,
      remark: `${line.choice || ""} ${line.addon || ""}`.trim(),
      choice: line.choice || "",
      addon: line.addon || "",
      category: line.category || ""
    });
  });

  const payload = {
    orderRef,
    customer: customerName.value,
    company: brandName.value,
    contact: contactNumber.value,
    status: "Draft",
    orderJson: JSON.stringify(items),
    items,
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString()
  };

  const result = await saveOrderPayload(payload);
  if (!result || result.success === false) {
    const errMsg = (result && (result.error || result.message)) || "Unknown error saving order";
    throw new Error("Save failed: " + errMsg);
  }
  return true;
}

async function submitEmail() {
  await ensurePricingCurrent();
  const t = buildText();
  if (!t) return;
  try {
    await saveOrderToGoogleSheet();
    alert("Order saved successfully.");
  } catch (err) {
    console.error(err);
    alert("Failed to save order: " + (err.message || err));
    return;
  }
  location.href = `mailto:?subject=New Order&body=${encodeURIComponent(t)}`;
}

async function submitWhatsApp() {
  await ensurePricingCurrent();
  const t = buildText();
  if (!t) return;

  const waNumber = "60143755008";
  window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(t)}`, "_blank");

  try {
    await saveOrderToGoogleSheet();
    alert("Order saved successfully.");
  } catch (err) {
    console.error(err);
    alert("Order sent to WhatsApp but failed to save.");
  }
}

/* ---------- wire up ---------- */
if (productList) {
  // Registered once, for the life of the page. See rowContext() above.
  productList.addEventListener("click", onProductListClick);
  productList.addEventListener("change", onProductListChange);
}

if (searchInput) {
  // Typing used to rebuild the entire list on every keystroke. Waiting for a
  // short pause means one rebuild per word rather than one per letter, which
  // is the difference between smooth and sticky on a phone.
  let searchDebounceHandle = null;
  searchInput.addEventListener("input", (e) => {
    const typed = e.target.value;
    if (searchDebounceHandle) clearTimeout(searchDebounceHandle);
    searchDebounceHandle = setTimeout(() => {
      CURRENT_SEARCH = typed;
      drainPendingProducts();
      renderProductList();
    }, 180);
  });
}
if (reviewBtnDesktop) reviewBtnDesktop.addEventListener("click", openOrderReview);
if (reviewBtnMobile) reviewBtnMobile.addEventListener("click", openOrderReview);

/* The staff Edit page reuses this file's renderer, but has to load the
   catalogue and the order being edited in a fixed order — catalogue first, so
   the order's line items can be matched back to real products. It sets
   window.PWDF_MANUAL_PRODUCT_LOAD before loading this script and calls
   loadProducts() itself. Without this check both loads would race, and the
   saved quantities would appear or vanish depending on which finished last. */
document.addEventListener("DOMContentLoaded", () => {
  if (window.PWDF_MANUAL_PRODUCT_LOAD) return;
  loadProducts();
});
