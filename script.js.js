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
let LAST_PRICING = { total: 0, byKey: {} }; // key -> {unitPrice, lineTotal}
let pricingDebounceHandle = null;

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
const deliveryDateInput = document.getElementById("deliveryDateInput");
const deliveryDateHint = document.getElementById("deliveryDateHint");
const deliveryAreaSelect = document.getElementById("deliveryAreaSelect");
const deliveryAreaHint = document.getElementById("deliveryAreaHint");

/* Delivery date rules come from the server (see getdeliveryrules in the
   backend) so the picker and the actual save-order check never drift apart.
   Sensible fallback defaults are used until that call comes back, or if it
   fails — the server has the final say either way. */
let DELIVERY_RULES = { leadWorkingDays: 3, closedWeekdayIso: 7, cutoffHour: 12, cutoffMinute: 30, pastCutoffNow: false, earliestDate: "" };

/* The list of delivery areas (see getdeliveryareas in the backend) — each
   area already comes with its actual allowed delivery weekdays computed
   server-side (pickup day + outstation/local offset, Sunday excluded), so
   the browser never has to re-derive the pickup/offset rule itself, only
   mirror the same lead-time-plus-weekday arithmetic once an area is picked. */
let DELIVERY_AREAS = [];
let SELECTED_DELIVERY_AREA = null;

/* Brand Name -> Delivery Area auto-match (see matchcustomer in the
   backend, and the staff-maintained BC_CUSTOMERS sheet behind it, built
   from a Business Central export). Lets a returning customer's delivery
   area fill in automatically once they type their brand name, instead of
   asking them to make sense of the (staff-oriented) area dropdown
   themselves. A brand-new lead not yet in the sheet just sees the normal
   manual picker — this is purely a shortcut, nothing depends on it.

   Deliberately, the full list of company names is NEVER downloaded to the
   browser (no autocomplete/suggestion list) — each keystroke-pause only
   asks the server "does THIS exact name match anyone?" and gets back just
   that one answer. A customer typing here can never see, browse, or
   discover any other customer's name or delivery area. */
let brandMatchDebounceTimer = null;
let brandMatchRequestSeq = 0;

function onBrandNameChange() {
  if (brandMatchDebounceTimer) clearTimeout(brandMatchDebounceTimer);
  const typedNow = brandName.value;
  brandMatchDebounceTimer = setTimeout(() => checkBrandNameMatch(typedNow), 400);
}

async function checkBrandNameMatch(companyTyped) {
  const pickerBlock = document.getElementById("deliveryAreaPickerBlock");
  const confirmedBlock = document.getElementById("deliveryAreaConfirmedBlock");
  const confirmedText = document.getElementById("deliveryAreaConfirmedText");
  const norm = String(companyTyped || "").trim();

  if (!norm) {
    if (confirmedBlock) confirmedBlock.hidden = true;
    if (pickerBlock) pickerBlock.hidden = false;
    return;
  }

  const seq = ++brandMatchRequestSeq;
  const result = await getFromGoogleApi({ action: "matchcustomer", company: norm });

  // If the customer kept typing while this request was in flight, a newer
  // request has already started — ignore this now-stale response so it
  // can't clobber a more recent (or since-cleared) result.
  if (seq !== brandMatchRequestSeq) return;
  // Also bail out if the field no longer holds what we asked about.
  if (brandName.value !== companyTyped) return;

  const match = result && result.success ? result.match : null;
  const stillOffered = match && DELIVERY_AREAS.some(a => a.id === match.areaId);

  if (stillOffered && deliveryAreaSelect) {
    deliveryAreaSelect.value = match.areaId;
    onDeliveryAreaChange();
    if (confirmedText) confirmedText.textContent = match.areaLabel;
    if (confirmedBlock) confirmedBlock.hidden = false;
    if (pickerBlock) pickerBlock.hidden = true;
  } else {
    if (confirmedBlock) confirmedBlock.hidden = true;
    if (pickerBlock) pickerBlock.hidden = false;
  }
}

async function loadDeliveryRules() {
  const result = await getFromGoogleApi({ action: "getdeliveryrules" });
  if (result && result.success) {
    DELIVERY_RULES = result;
  }
}

async function loadDeliveryAreas() {
  const result = await getFromGoogleApi({ action: "getdeliveryareas" });
  if (result && result.success && Array.isArray(result.areas)) {
    DELIVERY_AREAS = result.areas;
  }
  renderDeliveryAreaOptions();
}

function renderDeliveryAreaOptions() {
  if (!deliveryAreaSelect) return;
  if (!DELIVERY_AREAS.length) {
    deliveryAreaSelect.innerHTML = `<option value="">Could not load delivery areas — please refresh</option>`;
    return;
  }

  let html = `<option value="">Select your delivery area…</option>`;
  let currentGroup = null;
  DELIVERY_AREAS.forEach(area => {
    if (area.state !== currentGroup) {
      if (currentGroup !== null) html += `</optgroup>`;
      html += `<optgroup label="${escapeHtml(area.state)}">`;
      currentGroup = area.state;
    }
    html += `<option value="${escapeHtml(area.id)}">${escapeHtml(area.area)}</option>`;
  });
  if (currentGroup !== null) html += `</optgroup>`;
  deliveryAreaSelect.innerHTML = html;
}

/* Mirrors computeEarliestDeliveryDateForArea() on the backend exactly, so
   the date picker can auto-fill and validate instantly without a round
   trip — the server still re-checks everything on submit regardless.
   DELIVERY_RULES.pastCutoffNow comes straight from the server (it already
   knows whether "now" is past the 12:30pm business-time cutoff), so the
   browser never has to work out the cutoff itself from the visitor's own
   clock/timezone — it just adds the extra day the server already decided on. */
function computeEarliestDateForAreaClient(area) {
  if (!area || !Array.isArray(area.allowedWeekdaysIso) || !area.allowedWeekdaysIso.length) return "";
  const pad = n => String(n).padStart(2, "0");
  let date = new Date();
  if (DELIVERY_RULES.pastCutoffNow) {
    date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  }
  let workingDaysCounted = 0;
  for (let guard = 0; guard < 90; guard++) {
    date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    const isoWeekday = date.getDay() === 0 ? 7 : date.getDay();
    const isClosed = isoWeekday === DELIVERY_RULES.closedWeekdayIso;
    if (!isClosed) workingDaysCounted++;
    if (workingDaysCounted >= DELIVERY_RULES.leadWorkingDays && !isClosed) {
      if (area.allowedWeekdaysIso.indexOf(isoWeekday) !== -1) {
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      }
    }
  }
  return "";
}

const WEEKDAY_ISO_NAMES_CLIENT = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function isoWeekdayNameClient(iso) {
  return WEEKDAY_ISO_NAMES_CLIENT[iso - 1] || "";
}

function onDeliveryAreaChange() {
  if (!deliveryAreaSelect) return;
  const areaId = deliveryAreaSelect.value;
  SELECTED_DELIVERY_AREA = DELIVERY_AREAS.find(a => a.id === areaId) || null;

  if (!SELECTED_DELIVERY_AREA) {
    if (deliveryDateInput) {
      deliveryDateInput.disabled = true;
      deliveryDateInput.value = "";
    }
    if (deliveryDateHint) deliveryDateHint.textContent = "Please choose a delivery area first.";
    return;
  }

  const earliest = computeEarliestDateForAreaClient(SELECTED_DELIVERY_AREA);
  const dayNames = SELECTED_DELIVERY_AREA.allowedWeekdaysIso.map(isoWeekdayNameClient).join(", ");

  if (deliveryDateInput) {
    deliveryDateInput.disabled = false;
    if (earliest) deliveryDateInput.min = earliest;
    // Auto-fill / correct the date so customers aren't left guessing which
    // days are valid — they can still change it, as long as it's allowed.
    if (!deliveryDateInput.value || !isValidDeliveryDateClient(deliveryDateInput.value)) {
      deliveryDateInput.value = earliest;
    }
  }
  if (deliveryDateHint) {
    const cutoffNote = DELIVERY_RULES.pastCutoffNow
      ? ` (today's cutoff for new orders has passed, so counting starts from tomorrow)`
      : "";
    if (SELECTED_DELIVERY_AREA.id === "OTHER") {
      deliveryDateHint.textContent = earliest
        ? `We'll confirm your exact delivery day with you directly. Earliest possible date auto-filled below${cutoffNote}.`
        : `Sorry, there is no available delivery day right now.`;
    } else {
      deliveryDateHint.textContent = earliest
        ? `This area delivers on: ${dayNames}. Earliest available date auto-filled below${cutoffNote}.`
        : `Sorry, this area currently has no available delivery day.`;
    }
  }
}

function isValidDeliveryDateClient(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split("-").map(Number);
  const picked = new Date(parts[0], parts[1] - 1, parts[2]);
  if (isNaN(picked.getTime())) return false;
  const isoWeekday = picked.getDay() === 0 ? 7 : picked.getDay();
  if (isoWeekday === DELIVERY_RULES.closedWeekdayIso) return false;
  if (DELIVERY_RULES.earliestDate && value < DELIVERY_RULES.earliestDate) return false;
  if (SELECTED_DELIVERY_AREA && SELECTED_DELIVERY_AREA.allowedWeekdaysIso.indexOf(isoWeekday) === -1) return false;
  return true;
}

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

/* ---------- load products ---------- */
async function loadProducts() {
  productList.innerHTML = `<div class="no-results">Loading products…</div>`;
  const result = await getFromGoogleApi({ action: "getproducts" });
  if (!result || result.success !== true || !Array.isArray(result.products)) {
    productList.innerHTML = `<div class="no-results">Could not load the menu. Please refresh the page, or check your connection.</div>`;
    listCount.textContent = "";
    return;
  }
  ALL_PRODUCTS = result.products;
  buildCategoryList();
  renderCategoryUI();
  renderProductList();
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
  categoryRail.innerHTML = railHtml;
  categoryRail.querySelectorAll("[data-cat]").forEach(el => {
    el.addEventListener("click", () => setCategory(el.dataset.cat));
  });

  let stripHtml = `<div class="cat-chip ${CURRENT_CATEGORY === "" ? "active" : ""}" data-cat="">All (${totalCount})</div>`;
  CATEGORY_LIST.forEach(c => {
    stripHtml += `<div class="cat-chip ${CURRENT_CATEGORY === c.name ? "active" : ""}" data-cat="${escapeHtml(c.name)}">${escapeHtml(titleCase(c.name))} (${c.count})</div>`;
  });
  categoryStrip.innerHTML = stripHtml;
  categoryStrip.querySelectorAll("[data-cat]").forEach(el => {
    el.addEventListener("click", () => setCategory(el.dataset.cat));
  });
}

function titleCase(s) {
  return String(s || "").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function setCategory(cat) {
  CURRENT_CATEGORY = cat || "";
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

function renderProductList() {
  const filtered = getFilteredProducts();
  listTitle.textContent = CURRENT_CATEGORY ? titleCase(CURRENT_CATEGORY) : "All products";
  listCount.textContent = `${filtered.length} item${filtered.length === 1 ? "" : "s"}`;

  if (!filtered.length) {
    productList.innerHTML = `<div class="no-results">No products found. Try another search term.</div>`;
    return;
  }

  productList.innerHTML = "";
  filtered.forEach(p => {
    const row = document.createElement("div");
    row.className = "product-row";

    const choices = (p.choice || "").split("/").map(c => c.trim()).filter(Boolean);
    const initialChoice = choices.length ? choices[0] : "";

    // Only ever request a photo that is a real web address (the ones uploaded
    // via the staff portal's Drive photo tool). Older leftover values in the
    // sheet like "MASTER_LIST_PHOTO/DP-C0008.JPG" are local filenames from the
    // old system, not real links — requesting hundreds of those at once is
    // what was making the whole page look stuck on "Loading".
    const hasRealPhoto = /^https?:\/\//i.test(p.photo || "");

    row.innerHTML = `
      ${hasRealPhoto
        ? `<img class="product-thumb" src="${escapeHtml(p.photo)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=&quot;product-thumb placeholder&quot;>no photo</div>'">`
        : `<div class="product-thumb placeholder">no photo</div>`}
      <div class="product-info">
        <div class="p-name">${escapeHtml(p.name || "(unnamed)")}</div>
        <div class="p-meta">${escapeHtml(p.code)}</div>
      </div>
      <div class="opt-and-stepper">
        ${choices.length
          ? `<select class="opt-select">${choices.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}</select>`
          : `<span class="no-opt">—</span>`}
        <div class="stepper">
          <button type="button" class="minus">–</button>
          <input type="number" class="qty-val" min="0" value="0" inputmode="numeric">
          <button type="button" class="plus">+</button>
        </div>
      </div>
    `;

    const optSelect = row.querySelector(".opt-select");
    const qtyInput = row.querySelector(".qty-val");
    const minusBtn = row.querySelector(".minus");
    const plusBtn = row.querySelector(".plus");

    function currentChoice() {
      return optSelect ? optSelect.value : "";
    }

    function syncQtyDisplay() {
      const line = CART.get(cartKey(p.code, currentChoice()));
      const qty = line ? line.qty : 0;
      qtyInput.value = qty;
      row.classList.toggle("has-qty", qty > 0);
    }

    function applyQty(newQty) {
      newQty = Math.max(0, Math.floor(Number(newQty) || 0));
      setCartQty(p, currentChoice(), newQty);
      syncQtyDisplay();
    }

    minusBtn.addEventListener("click", () => {
      const line = CART.get(cartKey(p.code, currentChoice()));
      applyQty((line ? line.qty : 0) - 1);
    });
    plusBtn.addEventListener("click", () => {
      const line = CART.get(cartKey(p.code, currentChoice()));
      applyQty((line ? line.qty : 0) + 1);
    });
    qtyInput.addEventListener("change", () => applyQty(qtyInput.value));
    if (optSelect) {
      optSelect.addEventListener("change", syncQtyDisplay);
    }

    syncQtyDisplay();
    productList.appendChild(row);
  });
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
  orderTotal.textContent = formatMoney(LAST_PRICING.total);
  mobTotal.textContent = formatMoney(LAST_PRICING.total);
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

async function fetchCartPricing() {
  const { keys, items } = buildCartItemsPayload();
  if (!items.length) {
    LAST_PRICING = { total: 0, byKey: {} };
    return LAST_PRICING;
  }
  const result = await postToGoogleApi({ action: "calculatecart", items });
  if (!result || result.success !== true || !Array.isArray(result.items)) {
    return LAST_PRICING; // keep the last known-good figures rather than showing something broken
  }
  const byKey = {};
  result.items.forEach((it, i) => {
    const key = keys[i];
    if (key) byKey[key] = { unitPrice: it.unitPrice, lineTotal: it.lineTotal };
  });
  LAST_PRICING = { total: result.total, byKey };
  return LAST_PRICING;
}

function schedulePricingRefresh() {
  if (pricingDebounceHandle) clearTimeout(pricingDebounceHandle);
  pricingDebounceHandle = setTimeout(async () => {
    await fetchCartPricing();
    renderOrderPanel();
  }, 350);
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
  await fetchCartPricing(); // get an accurate figure right before showing it
  reviewBtnDesktop.disabled = false;
  reviewBtnMobile.disabled = false;
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
  popupTotal.textContent = formatMoney(LAST_PRICING.total);

  popupSummary.querySelectorAll(".cart-line").forEach(el => {
    const key = el.dataset.key;
    const line = CART.get(key);
    if (!line) return;
    el.querySelector(".popup-qty").addEventListener("change", async (e) => {
      const qty = Math.max(1, Math.floor(Number(e.target.value) || 1));
      line.qty = qty;
      refreshCartUI();
      await fetchCartPricing();
      renderPopupCart();
      renderProductList();
    });
    el.querySelector(".remove-line-btn").addEventListener("click", async () => {
      removeCartLine(key);
      await fetchCartPricing();
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
  if (!SELECTED_DELIVERY_AREA) {
    alert("Please select your delivery area.");
    return null;
  }
  if (!isValidDeliveryDateClient(deliveryDateInput.value)) {
    const dayNames = SELECTED_DELIVERY_AREA.allowedWeekdaysIso.map(isoWeekdayNameClient).join(", ");
    alert(`Please choose a valid delivery date — at least ${DELIVERY_RULES.leadWorkingDays} working days from today, not a Sunday (we're closed), and matching your area's delivery day(s): ${dayNames}.`);
    return null;
  }
  CURRENT_ORDER_REF = CURRENT_ORDER_REF || generateOrderRef();

  const areaLabel = `${SELECTED_DELIVERY_AREA.state} - ${SELECTED_DELIVERY_AREA.area}`;
  let text = `✅ ORDER CONFIRMATION\n\nOrder Ref: ${CURRENT_ORDER_REF}\n\nCustomer: ${customerName.value}\nBrand: ${brandName.value}\nContact: ${contactNumber.value}\nDelivery Area: ${areaLabel}\nDelivery Date: ${deliveryDateInput.value}\n\nITEMS:\n`;

  CART.forEach((line, key) => {
    const pricing = LAST_PRICING.byKey[key] || { lineTotal: 0 };
    text += `${line.qty} x ${line.name}${line.choice ? ` (${line.choice})` : ""}${line.addon ? ` - ${line.addon}` : ""} | ${formatMoney(pricing.lineTotal)}\n`;
  });

  text += `\n-------------------------\nTOTAL PRICE (indicative): ${formatMoney(LAST_PRICING.total)}\n`;
  if (SELECTED_DELIVERY_AREA.id === "OTHER") {
    text += `\n📌 Note: Your area isn't on our standard delivery schedule yet — our team will contact you to confirm the exact delivery day.\n`;
  }
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
    deliveryDate: deliveryDateInput.value,
    deliveryArea: SELECTED_DELIVERY_AREA ? SELECTED_DELIVERY_AREA.id : "",
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
  await fetchCartPricing();
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
  await fetchCartPricing();
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
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    CURRENT_SEARCH = e.target.value;
    renderProductList();
  });
}
if (reviewBtnDesktop) reviewBtnDesktop.addEventListener("click", openOrderReview);
if (reviewBtnMobile) reviewBtnMobile.addEventListener("click", openOrderReview);
if (deliveryAreaSelect) deliveryAreaSelect.addEventListener("change", onDeliveryAreaChange);
if (brandName) {
  brandName.addEventListener("input", onBrandNameChange);
  brandName.addEventListener("change", onBrandNameChange);
}

document.addEventListener("DOMContentLoaded", () => {
  loadProducts();
  loadDeliveryRules();
  loadDeliveryAreas();
});
