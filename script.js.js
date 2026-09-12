/* =========================================
   DECORATION SURCHARGE (SELLER ONLY)
   ========================================= */

const DECORATION_PRICE = {
  "BLOCK CAKE": 10.50,
  "SLAB CAKE": 10.50
};

const ORDER_POLICY_TEXT = `
⚠ IMPORTANT:
This order is considered CONFIRMED upon submission.

• Amendments are only allowed before the Sales Advisor confirms your order.
• No changes are allowed after the order has been submitted.
`;

const ORDER_CONFIRMATION_MESSAGE =
`⚠ IMPORTANT:
This order is considered CONFIRMED upon submission.

• Any amendment requests must be made before confirmation by the Sales Advisor.
• No changes will be accepted once the order has been submitted.

Do you want to proceed?`;

function goHome() {
  window.location.href = "index.html";
}
/* =========================================
   🔒 SELLER ONLY PRICE MAP
   (Customer never sees prices)
   ========================================= */

 function getCatalogCategoryOptions() {
  const options = [{ value: "all", label: "All Categories" }];
  const categories = Object.keys(PRODUCTS || {});

  categories.forEach(category => {
    options.push({ value: category, label: category });
  });

  return options;
}

function matchesSelectedCategory(category, selectedCategory) {
  if (selectedCategory === "all") return true;
  return category === selectedCategory;
}

/* =========================================
   PORTAL MODE + PRICING

   business : wholesale buyers. No prices shown - the sales advisor confirms
              pricing. Wholesale figures never reach a customer's browser.
   retail   : individual customers. Retail prices shown, from retail-prices.js.
   staff    : a logged-in salesperson. Wholesale prices are fetched from the
              Apps Script using the staff token, and shown as before.

   The wholesale price list used to live in this file, which meant anyone
   could read it. It now lives server-side in the Apps Script.
   ========================================= */

const MODE_STORAGE_KEY = "pwdfPortalMode";

function getPortalMode() {
  try {
    const m = localStorage.getItem(MODE_STORAGE_KEY);
    return (m === "retail" || m === "business") ? m : "";
  } catch (err) {
    return "";
  }
}

function setPortalMode(mode) {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch (err) {
    /* private browsing - the mode just won't be remembered */
  }
  applyPortalMode();
  renderMenu(smartSearchInput ? smartSearchInput.value : "");
}

/* Wholesale prices, once fetched for a logged-in staff member. */
let WHOLESALE_PRICES_LOADED = null;

function isStaffSession() {
  return typeof getStaffToken === "function" && !!getStaffToken();
}

async function loadWholesalePricesIfStaff() {
  if (!isStaffSession() || WHOLESALE_PRICES_LOADED) return;
  try {
    const res = await getFromGoogleApi({ action: "getprices" });
    if (res && res.success && res.prices) {
      WHOLESALE_PRICES_LOADED = res.prices;
      if (CART.length) renderCart();
      renderMenu(smartSearchInput ? smartSearchInput.value : "");
      applyPortalMode();
    }
  } catch (err) {
    console.warn("Could not load wholesale prices", err);
  }
}

/** The price list that applies right now, or null when prices must stay hidden. */
function activePriceMap() {
  if (isStaffSession() && WHOLESALE_PRICES_LOADED) return WHOLESALE_PRICES_LOADED;
  if (getPortalMode() === "retail" && typeof RETAIL_PRICE_MAP !== "undefined") return RETAIL_PRICE_MAP;
  return null;
}

function pricesAreVisible() {
  return activePriceMap() !== null;
}

function formatPrice(value) {
  return "RM " + Number(value || 0).toFixed(2);
}

/** Updates the page to match the chosen mode. */
function applyPortalMode() {
  const mode = getPortalMode();
  const chooser = document.getElementById("modeChooser");
  const label = document.getElementById("modeLabel");
  const guideNote = document.getElementById("guideNote");

  if (chooser) chooser.style.display = mode ? "none" : "flex";

  document.body.classList.toggle("mode-retail", mode === "retail");
  document.body.classList.toggle("mode-business", mode === "business");

  if (label) {
    if (isStaffSession()) label.textContent = "Staff view";
    else if (mode === "retail") label.textContent = "Customer";
    else if (mode === "business") label.textContent = "Business";
    else label.textContent = "";
  }

  if (guideNote) {
    guideNote.textContent = pricesAreVisible()
      ? "Prices shown are per item. Your total appears in the cart."
      : "Prices will be confirmed by your sales advisor";
  }
}

function getPriceCode(itemName, choice) {
  // base product code = first part of name
  let baseCode = itemName.split(" ")[0];

  // printed macaron logic
  if (baseCode.endsWith("-P")) {
    if (choice === "1 SIDED") return `${baseCode}-1S`;
    if (choice === "2 SIDED") return `${baseCode}-2S`;
  }

  return baseCode;
}
function generateOrderRef() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timePart = now.getHours().toString().padStart(2, "0") +
                   now.getMinutes().toString().padStart(2, "0");
  const randomPart = Math.floor(100 + Math.random() * 900); // 3 digits

  return `PWDF-${datePart}-${timePart}-${randomPart}`;
}

function updateSubmitButtonState() {
  const btn = document.getElementById("submitOrderBtn");
  btn.disabled = CART.length === 0;
  btn.style.opacity = CART.length === 0 ? 0.5 : 1;
}

const originalUpdateCounts = updateCounts;
updateCounts = function () {
  originalUpdateCounts();
  updateSubmitButtonState();
};

document.addEventListener("DOMContentLoaded", updateSubmitButtonState);

function getDecorationPrice(category, choice, addon, qty = 1) {
  if (!addon) return 0;

  if (
    (category === "BLOCK CAKE" && choice.includes("45")) ||
    (category === "SLAB CAKE" && choice.includes("90"))
  ) {
    return (DECORATION_PRICE[category] ?? 0) * qty;
  }

  return 0;
}

let CART = [];
let CURRENT_ORDER_REF = null;

const submitOrderBtn = document.getElementById("submitOrderBtn");
const orderGuide = document.getElementById("orderGuide");
const summaryPopup = document.getElementById("summaryPopup");
const popupSummary = document.getElementById("popupSummary");
const customerName = document.getElementById("customerName");
const brandName = document.getElementById("brandName");
const contactNumber = document.getElementById("contactNumber");
const cartCount = document.getElementById("cartCount");
const cartCountBottom = document.getElementById("cartCountBottom");
const smartSearchInput = document.getElementById("smartSearchInput");
const menuContainer = document.getElementById("menuContainer");
const categoryFilter = document.getElementById("priceMapCategoryFilter");

// Ensure button is clickable
if (submitOrderBtn) {
  submitOrderBtn.onclick = openOrderReview;
} else {
  console.warn("submitOrderBtn not found in DOM");
}

function updateCounts() {
  const total = CART.reduce((s, i) => s + i.qty, 0);
  if (cartCount) cartCount.textContent = total;
  if (cartCountBottom) cartCountBottom.textContent = total;
}

/* ADD TO CART + DECORATION */
function addToCart(item, qty, choice, category, btn) {
  let addon = "";

  // If choice not provided (some products include choice in the name),
  // infer "1 SIDED" or "2 SIDED" from the item name so pricing works.
  if (!choice) {
    const m = item.match(/\b(1 SIDED|2 SIDED)\b/);
    if (m) choice = m[1];
  }
  if (
    (category === "BLOCK CAKE" && choice.includes("45")) ||
    (category === "SLAB CAKE" && choice.includes("90"))
  ) {
    if (confirm("Add Decoration + RM 10.50 ?")) {
      addon = "Decoration + RM 10.50";
    }
  }

  const existing = CART.find(
    i => i.item === item && i.choice === choice && i.addon === addon
  );

  if (existing) existing.qty += qty;
  else CART.push({ item, qty, choice, addon, category });

  updateCounts();

  btn.textContent = "✓ Added";
  btn.classList.add("added");
  setTimeout(() => {
    btn.textContent = "Add";
    btn.classList.remove("added");
  }, 1000);
}

/* HIDE MENU UNTIL SEARCH */
function normalizeFileName(text) {
  return text
    .replace(/[“”‘’"']/g, "")
    .replace(/[^a-zA-Z0-9\s\-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}


function getImageCandidates(productName, category) {
  let code = (productName || "").split(" ")[0];

// ✅ remove "-12", "-10", etc
code = code.replace(/-\d+$/, "");
  return [
    `MASTER_LIST_PHOTO/${code}.JPG`,
    `MASTER_LIST_PHOTO/${code}.jpg`,
    `MASTER_LIST_PHOTO/${code}.PNG`,
    `MASTER_LIST_PHOTO/${code}.png`
  ];
}
function handleProductImageError(img) {
  const list = img.dataset.srcs.split("|");
  let i = parseInt(img.dataset.attempt || "0");

  i++;

  if (i < list.length) {
    img.dataset.attempt = i;
    img.src = list[i];
  } else {
    // ✅ NOTHING → just hide image
    img.style.display = "none";
  }
}
function populateCategoryFilter() {
  if (!categoryFilter) return;

  categoryFilter.innerHTML = "";
  getCatalogCategoryOptions().forEach(section => {
    const option = document.createElement("option");
    option.value = section.value;
    option.textContent = section.label;
    categoryFilter.appendChild(option);
  });
  categoryFilter.value = "all";
}

function renderMenu(keyword = "") {
  menuContainer.innerHTML = "";
  keyword = keyword.trim().toLowerCase();
  const selectedCategory = categoryFilter?.value || "all";
  const hasQuery = keyword !== "" || selectedCategory !== "all";
  if (!hasQuery) return;

  const matches = [];
  const blockedProducts = new Set(["CAKE-CR10-F0001"]);
  Object.keys(PRODUCTS).forEach(category => {
    PRODUCTS[category].forEach(p => {
      const code = (p.name || "").split(" ")[0] || "";
      if (blockedProducts.has(code)) return;
      if (!matchesSelectedCategory(category, selectedCategory)) return;
      const text = (p.name + p.choice + p.addon).toLowerCase();
      if (keyword && !text.includes(keyword)) return;
      matches.push({ category, item: p });
    });
  });

  matches.sort((a, b) => {
    const aMuffin = a.item.name.toLowerCase().includes("muffin");
    const bMuffin = b.item.name.toLowerCase().includes("muffin");
    if (aMuffin !== bMuffin) return aMuffin ? -1 : 1;
    return a.item.name.localeCompare(b.item.name);
  });

  if (!matches.length) {
    const noResult = document.createElement("div");
    noResult.className = "no-results";
    noResult.textContent = "No products found. Try another search term.";
    menuContainer.appendChild(noResult);
    return;
  }

  matches.forEach(({ category, item: p }) => {
    const code = p.name.split(" ")[0] || "";
    const label = p.name.replace(code, "").trim();
    const firstChoice = p.choice ? p.choice.split("/")[0].trim() : "";
    const cardUnitPrice = getUnitPrice(p.name, firstChoice);
    const priceHtml = (pricesAreVisible() && cardUnitPrice)
      ? `<div class="item-price">${formatPrice(cardUnitPrice)}</div>`
      : "";
    const imageList = getImageCandidates(p.name, category);
    const imagePath = imageList[0];
    const card = document.createElement("div");
    card.className = "item-card";
    card.innerHTML = `
      <div class="product-layout-photo">
        <img src="${imagePath}" alt="${label}" data-srcs="${imageList.join("|")}" data-attempt="0" onerror="handleProductImageError(this)" />
      </div>
      <div class="item-name">${label}</div>
      <div class="item-meta">${code}</div>
      ${priceHtml}
      <div class="controls">
        ${
          p.choice
            ? `<select class="qty-box">
                ${p.choice.split("/").map(c => `<option>${c.trim()}</option>`).join("")}
              </select>`
            : ""
        }
        <input type="number" min="1" value="1" class="qty-box">
        <button class="add-btn">Add</button>
      </div>
    `;

    const btn = card.querySelector(".add-btn");
    if (btn) {
      btn.onclick = () =>
        addToCart(
          p.name,
          Number(card.querySelector("input").value),
          card.querySelector("select")?.value || "",
          category,
          btn
        );
    }

    menuContainer.appendChild(card);
  });
}

populateCategoryFilter();
applyPortalMode();
loadWholesalePricesIfStaff();

if (smartSearchInput) {
  smartSearchInput.oninput = e => {
    const guide = document.getElementById("orderGuide");
    if (guide) guide.style.display = "none";
    document.body.classList.toggle("search-active", !!(e.target.value.trim() || categoryFilter?.value !== "all"));
    renderMenu(e.target.value);
  };
}

if (categoryFilter) {
  categoryFilter.onchange = () => {
    const guide = document.getElementById("orderGuide");
    if (guide) guide.style.display = "none";
    document.body.classList.toggle("search-active", !!(smartSearchInput?.value.trim() || categoryFilter.value !== "all"));
    renderMenu(smartSearchInput?.value || "");
  };
}

/* CART POPUP */
function openOrderReview() {
  if (!CART.length) {
    alert("Cart empty");
    return;
  }
  CURRENT_ORDER_REF = CURRENT_ORDER_REF || generateOrderRef();
  renderCart();
  // Show the modal popup with customer details
  summaryPopup.style.display = "flex";
  document.body.style.overflow = "hidden";
}

submitOrderBtn.onclick = openOrderReview;

function getUnitPrice(itemName, choice) {
  const map = activePriceMap();
  if (!map) return 0;
  const code = getPriceCode(itemName, choice);
  return map[code] ?? 0;
}

function renderCart() {
  popupSummary.innerHTML = "";
  if (!CART.length) {
    const empty = document.createElement("div");
    empty.className = "no-results";
    empty.textContent = "Your cart is empty.";
    popupSummary.appendChild(empty);
    return;
  }

  let total = 0;
  const showPrices = pricesAreVisible();
  CART.forEach((c, i) => {
    const unitPrice = getUnitPrice(c.item, c.choice);
    const decorationPrice = getDecorationPrice(c.category, c.choice, c.addon, c.qty);
    const lineTotal = unitPrice * c.qty + decorationPrice;
    total += lineTotal;

    const line = document.createElement("div");
    line.style.display = "flex";
    line.style.alignItems = "center";
    line.style.justifyContent = "space-between";
    line.style.gap = "8px";
    line.style.marginBottom = "10px";
    line.style.padding = "10px";
    line.style.border = "1px solid #eee";
    line.style.borderRadius = "12px";
    line.innerHTML = `
      <div style="flex:1; min-width:0;">
        <div style="font-weight:700;">${c.item}${c.choice ? ` (${c.choice})` : ""}</div>
        ${c.addon ? `<div class="item-meta">${c.addon}</div>` : ""}
        ${showPrices ? `<div class="item-meta">${formatPrice(lineTotal)}</div>` : ""}
      </div>
      <div style="display:grid; gap:6px; align-items:center; text-align:right; min-width:110px;">
        <input type="number" value="${c.qty}" min="1" style="width:72px; padding:6px; border-radius:8px; border:1px solid #ccc; text-align:right;">
        <button style="border:none; background:#ff6a00; color:#fff; padding:8px 10px; border-radius:10px; cursor:pointer;">Remove</button>
      </div>
    `;

    const qtyInput = line.querySelector("input");
    qtyInput.oninput = e => {
      c.qty = Math.max(1, Number(e.target.value));
      renderCart();
      updateCounts();
    };

    const removeBtn = line.querySelector("button");
    removeBtn.onclick = () => {
      CART.splice(i, 1);
      renderCart();
      updateCounts();
    };

    popupSummary.appendChild(line);
  });

  const totalLine = document.createElement("div");
  totalLine.style.marginTop = "16px";
  totalLine.style.paddingTop = "14px";
  totalLine.style.borderTop = "1px solid #eee";
  totalLine.style.display = "flex";
  totalLine.style.justifyContent = "space-between";
  totalLine.style.fontWeight = "700";
  totalLine.innerHTML = showPrices
    ? `<div>Total</div><div>${formatPrice(total)}</div>`
    : `<div>Total</div><div style="font-weight:600; text-align:right;">Your sales advisor<br>will confirm pricing</div>`;
  popupSummary.appendChild(totalLine);
}

/* SUBMIT */
function buildText() {
  if (!customerName.value || !brandName.value || !contactNumber.value) {
    alert("Please fill in Customer Name, Brand Name and Contact Number.");
    return null;
  }

  let total = 0;
  const showPrices = pricesAreVisible();
  CURRENT_ORDER_REF = CURRENT_ORDER_REF || generateOrderRef();

  let text = `✅ ORDER CONFIRMATION

Order Ref: ${CURRENT_ORDER_REF}

Customer: ${customerName.value}
Brand: ${brandName.value}
Contact: ${contactNumber.value}

ITEMS:
`;

  CART.forEach(item => {
    const unitPrice = getUnitPrice(item.item, item.choice);
    const baseTotal = unitPrice * item.qty;
    const decoPrice = getDecorationPrice(item.category, item.choice, item.addon, item.qty);
    const lineTotal = baseTotal + decoPrice;
    total += lineTotal;

    text += `${item.qty} x ${item.item}${item.choice ? ` (${item.choice})` : ""}${item.addon ? ` - ${item.addon}` : ""}${showPrices ? ` | ${formatPrice(lineTotal)}` : ""}\n`;
  });

  text += `
-------------------------
${showPrices ? `TOTAL PRICE: ${formatPrice(total)}` : "TOTAL PRICE: to be confirmed by your sales advisor"}

${ORDER_POLICY_TEXT}`;

  return text;
}



async function submitEmail() {
  const t = buildText();
  if (!t) return;

  try {
    await saveOrderToGoogleSheet();
    alert("Order saved successfully.");
  } catch (err) {
    console.error(err);
    alert("Failed to save order: " + (err.message || err));
  }

  location.href = `mailto:?subject=New Order&body=${encodeURIComponent(t)}`;
}

function closeSummary() {
  summaryPopup.style.display = "none";
  document.body.style.overflow = "auto";
}
async function saveOrderToGoogleSheet() {
  const orderRef = CURRENT_ORDER_REF || generateOrderRef();
  CURRENT_ORDER_REF = orderRef;

  const items = CART.map(item => ({
    code: item.item.split(" ")[0],
    name: item.item,
    qty: item.qty,
    remark: `${item.choice || ""} ${item.addon || ""}`.trim(),
    choice: item.choice || "",
    addon: item.addon || "",
    category: item.category || ""
  }));

  const payload = {
      orderRef,
      customer: customerName.value,
      company: brandName.value,
      contact: contactNumber.value,
      deliveryDate: "",
      status: "Draft",
      orderJson: JSON.stringify(items),
      items,
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString()
    };

  const result = await saveOrderPayload(payload);

  if (!result || result.success === false) {
    const errMsg = (result && (result.error || result.message)) || 'Unknown error saving order';
    throw new Error('Save failed: ' + errMsg);
  }

  return true;
}
async function submitWhatsApp() {

  const t = buildText();
  if (!t) return;

  // Open WhatsApp to specific number FIRST (Malaysia: 0143755008 -> 60143755008)
  const waNumber = '60143755008';
  const waWindow = window.open(
    `https://wa.me/${waNumber}?text=${encodeURIComponent(t)}`,
    "_blank"
  );

  try {
    await saveOrderToGoogleSheet();

    alert("Order saved successfully.");

  } catch (err) {

    console.error(err);

    alert("Order sent to WhatsApp but failed to save.");

  }
}
