/* Staff Product Portal — add, edit, price, hide and (soon) photograph products.
   Reuses the same staff token from google.js — if you're already logged in
   on the Sales Dashboard in this tab, you're already logged in here too. */

const LOGIN_STORAGE_KEY = "pwdfStaffAuth";

const loginPanel = document.getElementById("loginPanel");
const portalPanel = document.getElementById("portalPanel");
const logoutBtn = document.getElementById("logoutBtn");
const loginBtn = document.getElementById("loginBtn");

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const visibilityFilter = document.getElementById("visibilityFilter");
const addProductBtn = document.getElementById("addProductBtn");
const summaryLine = document.getElementById("summaryLine");
const productTableBody = document.getElementById("productTableBody");
const categoryList = document.getElementById("categoryList");

const drawerOverlay = document.getElementById("drawerOverlay");
const drawer = document.getElementById("drawer");
const drawerTitle = document.getElementById("drawerTitle");
const drawerCodeTag = document.getElementById("drawerCodeTag");
const drawerCloseBtn = document.getElementById("drawerCloseBtn");
const cancelDrawerBtn = document.getElementById("cancelDrawerBtn");
const saveProductBtn = document.getElementById("saveProductBtn");

const fieldName = document.getElementById("fieldName");
const fieldCode = document.getElementById("fieldCode");
const codeHint = document.getElementById("codeHint");
const fieldCategory = document.getElementById("fieldCategory");
const fieldOptions = document.getElementById("fieldOptions");
const fieldAddon = document.getElementById("fieldAddon");
const fieldPrice = document.getElementById("fieldPrice");
const fieldPhoto = document.getElementById("fieldPhoto");
const visibleSwitch = document.getElementById("visibleSwitch");
const photoPreview = document.getElementById("photoPreview");
const photoPlaceholder = document.getElementById("photoPlaceholder");

let allProducts = [];   // full list from the server, staff view (has price + visible)
let editingCode = null; // null while adding a new product

function isStaffLoggedIn() {
  return !!getStaffToken();
}

function setStaffAuthenticated(value) {
  sessionStorage.setItem(LOGIN_STORAGE_KEY, value ? "true" : "false");
}

function requireStaffLogin() {
  if (isStaffLoggedIn()) {
    loginPanel.classList.add("hidden");
    portalPanel.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    loadProducts();
  } else {
    loginPanel.classList.remove("hidden");
    portalPanel.classList.add("hidden");
    logoutBtn.classList.add("hidden");
  }
}

async function handleLogin() {
  const passwordInput = document.getElementById("staffPassword");
  if (!passwordInput) return;
  const entered = passwordInput.value.trim();
  if (!entered) { alert("Please enter the staff password."); return; }

  const originalLabel = loginBtn.textContent;
  loginBtn.disabled = true;
  loginBtn.textContent = "Checking…";

  const accepted = await verifyStaffToken(entered);

  loginBtn.disabled = false;
  loginBtn.textContent = originalLabel;

  if (accepted) {
    setStaffToken(entered);
    setStaffAuthenticated(true);
    passwordInput.value = "";
    requireStaffLogin();
  } else {
    passwordInput.value = "";
    alert("Invalid staff password.");
  }
}

function logoutStaff() {
  setStaffToken("");
  setStaffAuthenticated(false);
  requireStaffLogin();
}

async function loadProducts() {
  summaryLine.textContent = "Loading…";
  productTableBody.innerHTML = `<tr><td colspan="6" style="padding:20px; text-align:center; color:#9a8a55;">Loading products…</td></tr>`;

  const result = await getFromGoogleApi({ action: "getproducts" });
  if (!result || result.success !== true || !Array.isArray(result.products)) {
    productTableBody.innerHTML = `<tr><td colspan="6" style="padding:20px; text-align:center; color:#a33;">Could not load products. Check your connection and try refreshing.</td></tr>`;
    summaryLine.textContent = "";
    return;
  }

  allProducts = result.products;
  populateCategoryFilter();
  renderTable();
}

function populateCategoryFilter() {
  const cats = Array.from(new Set(allProducts.map(p => (p.category || "").trim()).filter(Boolean))).sort();
  const currentValue = categoryFilter.value;
  categoryFilter.innerHTML = `<option value="">All categories</option>` + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  categoryFilter.value = cats.includes(currentValue) ? currentValue : "";

  categoryList.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">`).join("");
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatPrice(n) {
  const num = Number(n) || 0;
  return "RM " + num.toFixed(2);
}

function getFilteredProducts() {
  const q = searchInput.value.trim().toLowerCase();
  const cat = categoryFilter.value;
  const vis = visibilityFilter.value;

  return allProducts.filter(p => {
    if (q) {
      const hay = ((p.name || "") + " " + (p.code || "")).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    if (cat && (p.category || "") !== cat) return false;
    if (vis === "visible" && p.visible === false) return false;
    if (vis === "hidden" && p.visible !== false) return false;
    return true;
  });
}

function renderTable() {
  const filtered = getFilteredProducts();
  const hiddenCount = allProducts.filter(p => p.visible === false).length;
  summaryLine.textContent = `${allProducts.length} products · ${hiddenCount} hidden from customers` +
    (filtered.length !== allProducts.length ? ` · showing ${filtered.length}` : "");

  if (!filtered.length) {
    productTableBody.innerHTML = `<tr><td colspan="6" style="padding:20px; text-align:center; color:#9a8a55;">No products match.</td></tr>`;
    return;
  }

  productTableBody.innerHTML = "";
  filtered.forEach(p => {
    const tr = document.createElement("tr");
    const isVisible = p.visible !== false;

    const photoCell = document.createElement("td");
    if (p.photo) {
      const img = document.createElement("img");
      img.className = "product-thumb";
      img.src = p.photo;
      img.alt = "";
      img.onerror = () => { img.replaceWith(placeholderThumb()); };
      photoCell.appendChild(img);
    } else {
      photoCell.appendChild(placeholderThumb());
    }
    tr.appendChild(photoCell);

    const nameCell = document.createElement("td");
    nameCell.innerHTML = `<div class="product-name">${escapeHtml(p.name || "(no name)")}</div><div class="product-code">${escapeHtml(p.code)}${p.choice ? " · " + escapeHtml(p.choice) : ""}</div>`;
    tr.appendChild(nameCell);

    const catCell = document.createElement("td");
    catCell.textContent = p.category || "-";
    tr.appendChild(catCell);

    const priceCell = document.createElement("td");
    priceCell.style.textAlign = "right";
    priceCell.style.fontFamily = "'Courier New', monospace";
    priceCell.textContent = formatPrice(p.price);
    tr.appendChild(priceCell);

    const statusCell = document.createElement("td");
    statusCell.innerHTML = isVisible
      ? `<span class="pill pill-visible"><span class="pill-dot" style="background:#4c9142;"></span>Visible</span>`
      : `<span class="pill pill-hidden"><span class="pill-dot" style="background:#a8a49c;"></span>Hidden</span>`;
    tr.appendChild(statusCell);

    const actionsCell = document.createElement("td");
    actionsCell.className = "row-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "icon-btn";
    editBtn.title = "Edit";
    editBtn.textContent = "✏️";
    editBtn.onclick = () => openEditDrawer(p);
    actionsCell.appendChild(editBtn);

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "icon-btn";
    toggleBtn.title = isVisible ? "Hide from customers" : "Show to customers";
    toggleBtn.textContent = isVisible ? "🙈" : "👁️";
    toggleBtn.onclick = () => quickToggleVisible(p);
    actionsCell.appendChild(toggleBtn);

    tr.appendChild(actionsCell);
    productTableBody.appendChild(tr);
  });
}

function placeholderThumb() {
  const div = document.createElement("div");
  div.className = "product-thumb placeholder";
  div.textContent = "no photo";
  return div;
}

async function quickToggleVisible(p) {
  const newVisible = p.visible === false;
  const verb = newVisible ? "show" : "hide";
  if (!confirm(`${newVisible ? "Show" : "Hide"} "${p.name}" ${newVisible ? "to" : "from"} customers?`)) return;

  const result = await postToGoogleApi({ action: "saveproduct", product: { code: p.code, visible: newVisible } });
  if (!result || result.success !== true) {
    alert("Could not update this product: " + (result && result.message ? result.message : "unknown error"));
    return;
  }
  p.visible = newVisible;
  renderTable();
}

function openAddDrawer() {
  editingCode = null;
  drawerTitle.textContent = "Add product";
  drawerCodeTag.textContent = "";
  fieldName.value = "";
  fieldCode.value = "";
  fieldCode.placeholder = "Auto-generated for new products";
  codeHint.textContent = "Left blank — a code is created automatically when you save.";
  fieldCategory.value = "";
  fieldOptions.value = "";
  fieldAddon.value = "";
  fieldPrice.value = "";
  fieldPhoto.value = "";
  setVisibleSwitch(true);
  showPhotoPreview("");
  openDrawer();
}

function openEditDrawer(p) {
  editingCode = p.code;
  drawerTitle.textContent = "Edit product";
  drawerCodeTag.textContent = p.code;
  fieldName.value = p.name || "";
  fieldCode.value = p.code || "";
  codeHint.textContent = "The product code can't be changed once created.";
  fieldCategory.value = p.category || "";
  fieldOptions.value = p.choice || "";
  fieldAddon.value = p.addon || "";
  fieldPrice.value = p.price || p.price === 0 ? p.price : "";
  fieldPhoto.value = p.photo || "";
  setVisibleSwitch(p.visible !== false);
  showPhotoPreview(p.photo || "");
  openDrawer();
}

function showPhotoPreview(photo) {
  if (photo) {
    photoPreview.src = photo;
    photoPreview.classList.remove("hidden");
    photoPlaceholder.classList.add("hidden");
    photoPreview.onerror = () => {
      photoPreview.classList.add("hidden");
      photoPlaceholder.classList.remove("hidden");
    };
  } else {
    photoPreview.classList.add("hidden");
    photoPlaceholder.classList.remove("hidden");
  }
}

function setVisibleSwitch(on) {
  visibleSwitch.classList.toggle("on", !!on);
  visibleSwitch.dataset.on = on ? "1" : "0";
}

function openDrawer() {
  drawerOverlay.classList.remove("hidden");
  drawer.classList.remove("hidden");
}

function closeDrawer() {
  drawerOverlay.classList.add("hidden");
  drawer.classList.add("hidden");
}

async function handleSaveProduct() {
  const name = fieldName.value.trim();
  if (!editingCode && !name) {
    alert("Please enter a product name.");
    return;
  }

  const priceRaw = fieldPrice.value.trim();
  if (priceRaw && isNaN(Number(priceRaw))) {
    alert("Wholesale price must be a number.");
    return;
  }

  const product = {
    code: editingCode || "",
    name: name,
    category: fieldCategory.value.trim(),
    choice: fieldOptions.value.trim(),
    addon: fieldAddon.value.trim(),
    price: priceRaw === "" ? 0 : Number(priceRaw),
    photo: fieldPhoto.value.trim(),
    visible: visibleSwitch.dataset.on === "1"
  };

  const originalLabel = saveProductBtn.textContent;
  saveProductBtn.disabled = true;
  saveProductBtn.textContent = "Saving…";

  const result = await postToGoogleApi({ action: "saveproduct", product: product });

  saveProductBtn.disabled = false;
  saveProductBtn.textContent = originalLabel;

  if (!result || result.success !== true) {
    alert("Could not save this product: " + (result && result.message ? result.message : "unknown error"));
    return;
  }

  closeDrawer();
  await loadProducts();
}

window.addEventListener("DOMContentLoaded", () => {
  loginBtn?.addEventListener("click", handleLogin);
  logoutBtn?.addEventListener("click", logoutStaff);

  document.getElementById("staffPassword")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
  });

  searchInput?.addEventListener("input", renderTable);
  categoryFilter?.addEventListener("change", renderTable);
  visibilityFilter?.addEventListener("change", renderTable);
  addProductBtn?.addEventListener("click", openAddDrawer);

  drawerCloseBtn?.addEventListener("click", closeDrawer);
  cancelDrawerBtn?.addEventListener("click", closeDrawer);
  drawerOverlay?.addEventListener("click", closeDrawer);
  saveProductBtn?.addEventListener("click", handleSaveProduct);
  visibleSwitch?.addEventListener("click", () => setVisibleSwitch(visibleSwitch.dataset.on !== "1"));

  requireStaffLogin();
});
