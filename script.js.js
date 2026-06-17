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
/* =========================================
   🔒 SELLER ONLY PRICE MAP
   (Customer never sees prices)
   ========================================= */

const PRICE_MAP = {

  /* ===== BREAD ===== */
  "BREAD-BG-B0004": 99.90,
  "BREAD-BG-B0043": 59.40,
  "BREAD-BG-B0008": 59.40,
  "BREAD-BG-B0009": 72.90,
  "BREAD-BG-C0003": 78.30,
  "BREAD-BG-C0011": 83.70,
  "BREAD-BG-E0002": 70.00,
  "BREAD-BG-M0001": 90.00,
  "BREAD-BG-M0003": 78.00,
  "BREAD-BG-P0001": 70.20,
  "BREAD-BG-P0002": 83.70,
  "BREAD-BG-P0009": 69.00,
  "BREAD-BG-S0004": 60.00,
  "BREAD-BR-H0001": 132.30,
  "BREAD-BR-H0002": 126.90,
  "BREAD-FL-F0001": 64.00,
  "BREAD-FL-O0002": 84.00,
  "BREAD-FL-V0007": 97.20,
  "BREAD-LF-B0014": 86.40,
  "BREAD-LF-K0002": 96.00,
  "BREAD-LF-S0009": 93.60,
  "BREAD-LF-S0010": 93.60,
  "BREAD-LF-L0002": 51.00,
  "BREAD-LF-C0005": 75.90,
  "BREAD-LF-M0004": 72.00,
  "BREAD-LF-W0036": 44.00,
  "BREAD-LF-W0015": 56.10,
  "BREAD-LF-W0004": 56.10,
  "BREAD-LF-W0002": 56.10,
  "BREAD-LF-W0018": 56.10,
  "BREAD-LF-W0009": 63.00,
  "BREAD-LF-S0003": 104.40,
  "BREAD-RL-S0002": 70.00,
  "BREAD-BL-G0004": 79.20,
  "BREAD-BL-G0007": 79.20,
  "BREAD-BL-G0008": 79.20,
  "BREAD-BL-G0009": 79.20,

  /* ===== WHOLE CAKE ===== */
  "CAKE-CR10-A0003": 78.75,
  "CAKE-CR10-C0014": 80.85,
  "CAKE-CR10-S0004": 94.50,
  "CAKE-CR10-A0001": 103.95,
  "CAKE-CR10-C0007": 103.95,
  "CAKE-CR10-F0001": 103.95,
  "CAKE-CR10-R0002": 103.95,
  "CAKE-CR10-R0005": 103.95,
  "CAKE-CR10-S0001": 103.95,
  "CAKE-CR10-N0005": 110.25,
  "CAKE-CR10-S0002": 110.25,
  "CAKE-CR9-G0002": 93.45,
  "CAKE-CR9-C0002": 93.45,
  "CAKE-CR9-V0002": 93.45,
  "CAKE-CR9-T0001": 93.45,
  "CAKE-CR9-G0001": 93.45,
  "CAKE-CR9-P0001": 96.60,
  "CAKE-CR9-P0002": 96.60,
  "CAKE-CR9-R0002": 98.70,
  "CAKE-CR9-C0001": 98.70,
  "CAKE-CR9-C0004": 96.60,
  "CAKE-CR9-C0008": 93.45,
  "CAKE-CR9-F0002": 93.45,

  /* ===== 8 INCH CAKE ===== */
  "CAKE-CR8-C0008": 67.20,
  "CAKE-CR8-R0007": 69.30,
  "CAKE-CR8-A0002": 71.40,
  "CAKE-CR8-B0001": 71.40,
  "CAKE-CR8-C0029": 71.40,
  "CAKE-CR8-M0033": 71.40,
  "CAKE-CR8-C0007": 73.50,
  "CAKE-CR8-C0009": 73.50,
  "CAKE-CR8-F0001": 73.50,
  "CAKE-CR8-P0027": 73.50,
  "CAKE-CR8-S0001": 74.55,
  "CAKE-CR8-N0002": 75.60,
  "CAKE-CR8-R0016": 75.60,
  "CAKE-CR8-B0003": 78.75,
  "CAKE-CR8-M0034": 78.75,
  "CAKE-CR8-N0001": 78.75,
  "CAKE-CR8-O0002": 78.75,
  "CAKE-CR8-R0001": 78.75,
  "CAKE-CR8-R0004": 78.75,
  "CAKE-CR8-S0019": 78.75,
  "CAKE-CR8-A0001": 79.80,
  "CAKE-CR8-F0002": 79.80,
  "CAKE-CR8-H0001": 79.80,
  "CAKE-CR8-C0033": 81.90,
  "CAKE-CR8-M0002": 81.90,
  "CAKE-CR8-T0002": 81.90,
  "CAKE-CR8-A0004": 82.95,
  "CAKE-CR8-B0011": 82.95,
  "CAKE-CR8-B0012": 82.95,
  "CAKE-CR8-C0080": 82.95,
  "CAKE-CR8-M0010": 82.95,
  "CAKE-CR8-P0028": 82.95,
  "CAKE-CR8-P0007": 82.95,
  "CAKE-CR8-S0002": 82.95,
  "CAKE-CR8-S0006": 82.95,
  "CAKE-CR8-C0018": 84.00,
  "CAKE-CR8-N0004": 84.00,
  "CAKE-CR8-O0008": 85.05,
  "CAKE-CR8-C0078": 88.20,
  "CAKE-CR8-B0013": 89.25,
  "CAKE-CR8-O0009": 89.25,
  "CAKE-CR8-R0029": 89.25,
  "CAKE-CR8-S0042": 89.25,
  "CAKE-CR8-S0007": 89.25,
   "CAKE-CR8-C0030": 99.75,
   

  /* ===== BLOCK CAKE ===== */
  "CAKE-BLK-Y0001": 50.40,
  "CAKE-BLK-T0001": 63.00,
  "CAKE-BLK-R0008": 54.60,
  "CAKE-BLK-P0019": 74.55,
  "CAKE-BLK-P0012": 74.55,
  "CAKE-BLK-P0008": 63.00,
  "CAKE-BLK-P0006": 54.60,
  "CAKE-BLK-P0004": 54.60,
  "CAKE-BLK-L0003": 50.40,
  "CAKE-BLK-L0002": 63.00,
  "CAKE-BLK-G0001": 50.40,
  "CAKE-BLK-C0002": 50.40,
  "CAKE-BLK-B0038": 50.40,
  "CAKE-BLK-B0037": 54.60,
  "CAKE-BLK-B0036": 50.40,
  "CAKE-BLK-B0035": 54.60,
  "CAKE-BLK-B0034": 50.40,
  "CAKE-BLK-B0030": 50.40,
  "CAKE-BLK-B0029": 63.00,
  "CAKE-BLK-B0028": 50.40,
  "CAKE-BLK-C0006": 86.10,
  "CAKE-BLK-C0004": 50.40,
  "CAKE-BLK-P0061": 54.60,
  "CAKE-BLK-R0009": 54.60,

  /* ===== SLAB CAKE ===== */
  "CAKE-SL-Y0001": 92.40,
  "CAKE-SL-T0001": 115.50,
  "CAKE-SL-S0001": 157.50,
  "CAKE-SL-R0008": 99.75,
  "CAKE-SL-R0002": 92.40,
  "CAKE-SL-R0001": 157.50,
  "CAKE-SL-P0019": 136.50,
  "CAKE-SL-P0012": 136.50,
  "CAKE-SL-P0006": 99.75,
  "CAKE-SL-P0004": 99.75,
  "CAKE-SL-P0001": 115.50,
  "CAKE-SL-M0002": 92.40,
  "CAKE-SL-M0001": 157.50,
  "CAKE-SL-L0002": 115.50,
  "CAKE-SL-H0001": 157.50,
  "CAKE-SL-G0001": 92.40,
  "CAKE-SL-C0003": 99.75,
  "CAKE-SL-C0002": 92.40,
  "CAKE-SL-C0001": 92.40,
  "CAKE-SL-B0005": 92.40,
  "CAKE-SL-B0004": 92.40,
  "CAKE-SL-B0003": 115.50,
  "CAKE-SL-B0002": 99.75,
  "CAKE-SL-B0001": 92.40,
  "CAKE-SL-C0006": 157.50,
  "CAKE-SL-C0004": 92.40,
  "CAKE-SL-P0061": 99.75,
  "CAKE-SL-R0009": 99.75,

  /* ===== DONUT ===== */
  "DONUT-C0001": 57.12,
  "DONUT-O0001": 60.48,
  "DONUT-R0001": 57.12,
  "DONUT-S0001": 57.12,
  "DONUT-W0001": 57.12,
  "DONUT-P0003": 73.50,
  "DONUT-P0012": 102.00,
  "DONUT-C0002": 57.12,
  "DONUT-P0005": 60.48,
  "DONUT-S0002": 57.12,
  "DONUT-T0001": 57.12,

  /* ===== TARTLET ===== */
  "TR-C0002": 99.54,
  "TR-L0002": 86.94,
  "TR-P0007": 99.54,
  "TR-R0001": 99.54,
  "TR-T0008": 96.39,
  "TR-RD-T0006": 324.00,

  /* ===== INDIVIDUAL CAKE ===== */
  "CAKE-IL-C0002": 44.10,
  "CAKE-IL-C0017": 47.25,
  "CAKE-IL-B0003": 66.15,
  "CAKE-IL-G0002": 66.15,
  "CAKE-IL-L0006": 66.15,
  "CAKE-IL-P0001": 66.15,
  "CAKE-IL-B0002": 68.99,
  "CAKE-IL-M0007": 70.88,
  "CAKE-IL-P0022": 71.40,
  "CAKE-IL-T0004": 73.50,
  "CAKE-IL-T0005": 101.75,
  "CAKE-IL-C0038": 75.60,
  "CAKE-IL-M0012": 75.60,
  "CAKE-IL-E0014": 79.80,
  "CAKE-IL-H0009": 100.80,
  "CAKE-IL-I0002": 122.85,
  "CAKE-IL-R0016": 123.48,
  "CAKE-IL-H0008": 138.60,

  /* ===== CUP SERIES ===== */
  "CAKE-CUP-M0001": 90.72,
  "CAKE-CUP-M0002": 90.72,
  "CAKE-CUP-M0003": 90.72,
  "CAKE-CUP-M0004": 90.72,
  "CAKE-CUP-M0005": 90.72,
  "CAKE-CUP-M0006": 90.72,
  "CAKE-CUP-M0007": 90.72,
  "CAKE-CUP-M0008": 90.72,
  "CAKE-CUP-M0009": 90.72,
  "CAKE-CUP-M0010": 90.72,

  /* ===== OPERA SERIES ===== */
  "CAKE-IL-O0001": 77.70,
  "CAKE-IL-H0007": 98.91,
  "CAKE-IL-M0035": 98.91,
  "CAKE-IL-R0015": 98.91,
  "CAKE-IL-S0005": 98.91,

  /* ===== PETITE SERIES ===== */
  "CAKE-IL-P0023": 41.58,
  "CAKE-IL-P0024": 27.72,
  "CAKE-IL-P0025": 46.20,
  "CAKE-IL-P0026": 46.20,
  "CAKE-IL-P0027": 40.43,

  /* ===== MACARON ===== */
  "MCN-M0012": 24.15,
  "MCN-M0013": 24.15,
  "MCN-M0014": 24.15,
  "MCN-M0015": 24.15,
  "MCN-M0016": 24.15,
  "MCN-M0017": 24.15,
  "MCN-M0018": 24.15,
  "MCN-M0019": 24.15,
  "MCN-M0020": 24.15,
  "MCN-N0001": 44.10,
  "MCN-N0002": 44.10,
  "MCN-N0003": 44.10,
  "MCN-N0004": 44.10,
  "MCN-N0005": 44.10,
  "MCN-N0006": 44.10,
  "MCN-N0007": 44.10,
  "MCN-N0008": 44.10,
  "MCN-P0001": 53.55,
  "MCN-P0002": 53.55,
  "MCN-P0003": 53.55,
  "MCN-P0004": 53.55,
  "MCN-P0005": 53.55,
  "MCN-P0007": 53.55,
  "MCN-P0019": 53.55,

  /* ===== MINI MUFFIN ===== */
  "MFF-M0053": 25.20,
  "MFF-M0054": 25.20,
  "MFF-M0055": 25.20,
  "MFF-M0056": 25.20,
  "MFF-M0057": 25.20,

  /* ===== MUFFIN ===== */
  "MFF-M0023": 129.15,
  "MFF-M0024": 129.15,
  "MFF-M0021": 110.25,
  "MFF-M0022": 110.25,
  "MFF-M0025": 129.15,
  "MFF-M0026": 129.15,
  "MFF-M0027": 129.15,
  "MFF-M0033": 138.60,
  "MFF-M0034": 138.60,
  "MFF-M0023-12": 54.18,
  "MFF-M0024-12": 54.18,
  "MFF-M0025-12": 54.18,
  "MFF-M0026-12": 54.18,
  "MFF-M0027-12": 54.18,
  "MFF-M0033-12": 57.96,
  "MFF-M0034-12": 57.96,

  /* ===== PASTRY ===== */
  "CRT-B0005": 123.90,
  "CRT-B0006": 132.50,
  "CRT-B0010": 140.40,
  "CRT-B0011": 115.20,
  "CRT-C0007": 72.29,
  "CRT-C0010": 164.64,
  "CRT-H0002": 164.64,
  "CRT-S0002": 170.52,
  "DP-C0001": 105.84,
  "CRT-C0011": 352.80,
  "DP-C0002": 164.64,
  "DP-C0003": 204.12,
  "DP-C0006": 88.20,
  "DP-C0008": 73.50,
  "DP-C0009": 132.30,
  "PP-PB-B0009": 121.91,
  "PP-PB-C0007": 93.24,
  "PP-PB-K0002": 108.36,
  "CRT-M0003": 60.00,
  "PP-PB-R0001": 98.28,
  "PP-PB-T0002": 98.28,
  "PP-PB-S0007": 165.90,
  "PP-PB-H0001": 207.90,
  "CRT-B0013": 118.65,
  "DP-N0001": 115.50,
  "DP-T0001": 115.50,
  "DP-Y0001": 115.50,
  "DP-A0002": 115.50,

  /* ===== PIZZA ===== */
  "PIZZA-P0009": 109.20,
  "PIZZA-P0013": 186.90,
  "PIZZA-P0012": 111.30,
  "PIZZA-P0001": 252.00,
  "PIZZA-P0002": 109.20,
/* ===== PRINTED / STAMPED MACARON (1 SIDED) ===== */
"MCN-M0012-P-1S": 31.50,
"MCN-M0013-P-1S": 31.50,
"MCN-M0014-P-1S": 31.50,
"MCN-M0015-P-1S": 31.50,
"MCN-M0016-P-1S": 31.50,
"MCN-M0017-P-1S": 31.50,
"MCN-M0018-P-1S": 31.50,
"MCN-M0019-P-1S": 31.50,
"MCN-M0020-P-1S": 31.50,

"MCN-N0001-P-1S": 100.80,
"MCN-N0002-P-1S": 100.80,
"MCN-N0003-P-1S": 100.80,
"MCN-N0004-P-1S": 100.80,
"MCN-N0005-P-1S": 100.80,
"MCN-N0006-P-1S": 100.80,
"MCN-N0007-P-1S": 100.80,
"MCN-N0008-P-1S": 100.80,

"MCN-P0001-P-1S": 114.98,
"MCN-P0002-P-1S": 114.98,
"MCN-P0003-P-1S": 114.98,
"MCN-P0004-P-1S": 114.98,
"MCN-P0005-P-1S": 114.98,
"MCN-P0007-P-1S": 114.98,
"MCN-P0019-P-1S": 114.98,

/* ===== PRINTED / STAMPED MACARON (2 SIDED) ===== */
"MCN-M0012-P-2S": 37.80,
"MCN-M0013-P-2S": 37.80,
"MCN-M0014-P-2S": 37.80,
"MCN-M0015-P-2S": 37.80,
"MCN-M0016-P-2S": 37.80,
"MCN-M0017-P-2S": 37.80,
"MCN-M0018-P-2S": 37.80,
"MCN-M0019-P-2S": 37.80,
"MCN-M0020-P-2S": 37.80,

"MCN-N0001-P-2S": 110.25,
"MCN-N0002-P-2S": 110.25,
"MCN-N0003-P-2S": 110.25,
"MCN-N0004-P-2S": 110.25,
"MCN-N0005-P-2S": 110.25,
"MCN-N0006-P-2S": 110.25,
"MCN-N0007-P-2S": 110.25,
"MCN-N0008-P-2S": 110.25,

"MCN-P0001-P-2S": 124.43,
"MCN-P0002-P-2S": 124.43,
"MCN-P0003-P-2S": 124.43,
"MCN-P0004-P-2S": 124.43,
"MCN-P0005-P-2S": 124.43,
"MCN-P0007-P-2S": 124.43,
"MCN-P0019-P-2S": 124.43,

  /* ===== SCONE ===== */
  "SCN-P0001": 160.00

  
  
};
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

function updateCounts() {
  const total = CART.reduce((s, i) => s + i.qty, 0);
  cartCount.textContent = total;
  cartCountBottom.textContent = total;
}

/* ADD TO CART + DECORATION */
function addToCart(item, qty, choice, category, btn) {
  let addon = "";

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
function renderMenu(keyword = "") {
  menuContainer.innerHTML = "";
  keyword = keyword.trim().toLowerCase();
  if (!keyword) return;

  const matches = [];
  Object.keys(PRODUCTS).forEach(category => {
    PRODUCTS[category].forEach(p => {
      const text = (p.name + p.choice + p.addon).toLowerCase();
      if (!text.includes(keyword)) return;
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

smartSearchInput.oninput = e => {
  const guide = document.getElementById("orderGuide");
  if (guide) guide.style.display = "none";
  document.body.classList.toggle("search-active", !!e.target.value.trim());
  renderMenu(e.target.value);
};

/* CART POPUP */
function openOrderReview() {
  if (!CART.length) {
    alert("Cart empty");
    return;
  }
  renderCart();
  summaryPopup.style.display = "flex";
  document.body.style.overflow = "hidden";
}

submitOrderBtn.onclick = openOrderReview;

function getUnitPrice(itemName, choice) {
  const code = getPriceCode(itemName, choice);
  return PRICE_MAP[code] ?? 0;
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
  totalLine.innerHTML = `
    <div>Total</div>
    <div>RM ${total.toFixed(2)}</div>
  `;
  popupSummary.appendChild(totalLine);
}

/* SUBMIT */
function buildText() {
  if (!customerName.value || !brandName.value || !contactNumber.value) {
    alert("Please fill in Customer Name, Brand Name and Contact Number.");
    return null;
  }

  let total = 0;
  const orderRef = generateOrderRef();

  let text = `✅ ORDER CONFIRMATION

Order Ref: ${orderRef}

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

    text += `${item.qty} x ${item.item}${item.choice ? ` (${item.choice})` : ""}${item.addon ? ` - ${item.addon}` : ""} | RM ${lineTotal.toFixed(2)}\n`;
  });

  text += `
-------------------------
TOTAL PRICE: RM ${total.toFixed(2)}

${ORDER_POLICY_TEXT}`;

  return text;
}

function submitWhatsApp() {
  const t = buildText();
  if (t) window.open(`https://wa.me/?text=${encodeURIComponent(t)}`);
}

function submitEmail() {
  const t = buildText();
  if (t) location.href = `mailto:?subject=New Order&body=${encodeURIComponent(t)}`;
}

function closeSummary() {
  summaryPopup.style.display = "none";
  document.body.style.overflow = "auto";
}

