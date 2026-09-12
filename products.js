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
const photoDropzone = document.getElementById("photoDropzone");
const photoDropzoneText = document.getElementById("photoDropzoneText");
const photoFileInput = document.getElementById("photoFileInput");

const bulkUploadBtn = document.getElementById("bulkUploadBtn");
const bulkOverlay = document.getElementById("bulkOverlay");
const bulkDrawer = document.getElementById("bulkDrawer");
const bulkCloseBtnTop = document.getElementById("bulkCloseBtnTop");
const bulkCloseBtn = document.getElementById("bulkCloseBtn");
const bulkDropzone = document.getElementById("bulkDropzone");
const bulkDropzoneText = document.getElementById("bulkDropzoneText");
const bulkFileInput = document.getElementById("bulkFileInput");
const bulkStartBtn = document.getElementById("bulkStartBtn");
const bulkCancelBtn = document.getElementById("bulkCancelBtn");
const bulkSummary = document.getElementById("bulkSummary");
const bulkProgressList = document.getElementById("bulkProgressList");

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
    // Only request a photo that's a real web address (uploaded via this portal).
    // Older leftover values like "MASTER_LIST_PHOTO/DP-C0008.JPG" are local
    // filenames, not links — requesting hundreds of those at once is what was
    // slowing the whole table (and the customer page) down.
    if (p.photo && /^https?:\/\//i.test(p.photo)) {
      const img = document.createElement("img");
      img.className = "product-thumb";
      img.src = p.photo;
      img.loading = "lazy";
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
  resetPhotoDropzoneText();
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
  resetPhotoDropzoneText();
  openDrawer();
}

function resetPhotoDropzoneText() {
  photoDropzoneText.innerHTML = `📷 Drop a photo here, or click to browse<br><span style="font-size:10.5px;">JPG, PNG or WEBP — resized automatically</span>`;
  photoDropzone.classList.remove("uploading", "dragover");
  photoFileInput.value = "";
}

const MAX_PHOTO_DIMENSION = 1000; // px, longest side after resizing
const JPEG_QUALITY = 0.82;
const MAX_RAW_FILE_BYTES = 20 * 1024 * 1024; // 20MB — sanity cap before we even try to read it

/**
 * Shrinks an image file down in the browser before it ever leaves the
 * device, so uploads are fast and never hit the server's size limit.
 * Resolves to { base64, mimeType, dataUrl }.
 */
function resizeImageForUpload(file) {
  return new Promise((resolve, reject) => {
    if (!file.type || file.type.indexOf("image/") !== 0) {
      reject(new Error("That doesn't look like an image file."));
      return;
    }
    if (file.size > MAX_RAW_FILE_BYTES) {
      reject(new Error("That photo is too large (over 20MB). Please try a smaller one."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not open that image."));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_PHOTO_DIMENSION || height > MAX_PHOTO_DIMENSION) {
          if (width >= height) {
            height = Math.round(height * (MAX_PHOTO_DIMENSION / width));
            width = MAX_PHOTO_DIMENSION;
          } else {
            width = Math.round(width * (MAX_PHOTO_DIMENSION / height));
            height = MAX_PHOTO_DIMENSION;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        const base64 = dataUrl.split(",")[1];
        resolve({ base64, mimeType: "image/jpeg", dataUrl });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handlePhotoFile(file) {
  if (!file) return;

  let resized;
  try {
    resized = await resizeImageForUpload(file);
  } catch (err) {
    alert(err.message || "Could not process that photo.");
    return;
  }

  // Show the resized photo immediately, before the upload even finishes.
  photoPreview.src = resized.dataUrl;
  photoPreview.classList.remove("hidden");
  photoPlaceholder.classList.add("hidden");

  photoDropzone.classList.add("uploading");
  photoDropzoneText.textContent = "Uploading…";

  const result = await postToGoogleApi({
    action: "uploadphoto",
    filename: file.name || "product-photo.jpg",
    mimeType: resized.mimeType,
    dataBase64: resized.base64
  });

  photoDropzone.classList.remove("uploading");

  if (!result || result.success !== true) {
    photoDropzoneText.innerHTML = `📷 Drop a photo here, or click to browse<br><span style="font-size:10.5px;">JPG, PNG or WEBP — resized automatically</span>`;
    alert("Photo upload failed: " + (result && result.message ? result.message : "unknown error") + "\n\nYou can try again, or type a photo URL directly into the Photo file box below.");
    return;
  }

  fieldPhoto.value = result.photo;
  photoDropzoneText.textContent = "✓ Photo uploaded — drop another to replace it";
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

/*****************************************************
 * BULK PHOTO UPLOAD
 *
 * Staff pick every photo at once (e.g. their whole MASTER_LIST_PHOTO
 * folder). Each file must be named exactly like the product's code
 * (BREAD-BG-B0004.jpg). We match it to the product already loaded in
 * allProducts, resize it the same way as a single upload, send it to
 * the same uploadphoto/saveproduct endpoints, and show progress live.
 * No backend changes are needed for this feature.
 *****************************************************/
let bulkFiles = [];       // File objects chosen, image files only
let bulkRunning = false;
let bulkStopRequested = false;

function findProductByCode(code) {
  const target = String(code || "").trim().toUpperCase();
  if (!target) return null;
  return allProducts.find(p => String(p.code || "").trim().toUpperCase() === target) || null;
}

function fileBaseName(filename) {
  return String(filename || "").replace(/\.[^.]+$/, "").trim();
}

function openBulkDrawer() {
  bulkFiles = [];
  bulkRunning = false;
  bulkStopRequested = false;
  bulkFileInput.value = "";
  bulkDropzoneText.textContent = "📁 Click to choose photos, or drop them here";
  bulkSummary.textContent = "";
  bulkProgressList.innerHTML = "";
  bulkStartBtn.disabled = true;
  bulkCancelBtn.classList.add("hidden");
  bulkOverlay.classList.remove("hidden");
  bulkDrawer.classList.remove("hidden");
}

function closeBulkDrawer() {
  if (bulkRunning && !confirm("An upload is still in progress. Stop it and close?")) return;
  bulkStopRequested = true;
  bulkOverlay.classList.add("hidden");
  bulkDrawer.classList.add("hidden");
  // Reflect any photos that were successfully attached while the drawer was open.
  renderTable();
}

function handleBulkFilesChosen(fileList) {
  const all = Array.from(fileList || []);
  const images = all.filter(f => f.type && f.type.indexOf("image/") === 0);
  const skippedNonImage = all.length - images.length;

  bulkFiles = images;
  renderBulkFileList();

  bulkStartBtn.disabled = bulkFiles.length === 0;
  bulkDropzoneText.textContent = `${bulkFiles.length} photo${bulkFiles.length === 1 ? "" : "s"} selected` +
    (skippedNonImage ? ` (${skippedNonImage} non-image file${skippedNonImage === 1 ? "" : "s"} ignored)` : "");
}

function renderBulkFileList() {
  bulkProgressList.innerHTML = "";
  bulkFiles.forEach((file, i) => {
    const row = document.createElement("div");
    row.className = "bulk-row status-pending";
    row.id = `bulkRow-${i}`;
    row.innerHTML = `<span class="bulk-name">${escapeHtml(file.name)}</span><span class="bulk-status">Pending</span>`;
    bulkProgressList.appendChild(row);
  });
  bulkSummary.textContent = bulkFiles.length ? `${bulkFiles.length} photo${bulkFiles.length === 1 ? "" : "s"} ready to upload.` : "";
}

function setBulkRowStatus(i, statusClass, label) {
  const row = document.getElementById(`bulkRow-${i}`);
  if (!row) return;
  row.className = `bulk-row status-${statusClass}`;
  row.querySelector(".bulk-status").textContent = label;
}

async function processBulkFile(file) {
  const code = fileBaseName(file.name);
  const product = findProductByCode(code);
  if (!product) {
    return { status: "nomatch", label: "✗ No matching product code" };
  }

  let resized;
  try {
    resized = await resizeImageForUpload(file);
  } catch (err) {
    return { status: "error", label: "✗ " + (err.message || "Could not read image") };
  }

  const uploadResult = await postToGoogleApi({
    action: "uploadphoto",
    filename: file.name,
    mimeType: resized.mimeType,
    dataBase64: resized.base64
  });
  if (!uploadResult || uploadResult.success !== true) {
    return { status: "error", label: "✗ Upload failed: " + ((uploadResult && uploadResult.message) || "unknown error") };
  }

  const saveResult = await postToGoogleApi({
    action: "saveproduct",
    product: { code: product.code, photo: uploadResult.photo }
  });
  if (!saveResult || saveResult.success !== true) {
    return { status: "error", label: "✗ Saved photo but could not attach it: " + ((saveResult && saveResult.message) || "unknown error") };
  }

  product.photo = uploadResult.photo; // keep our local cache in sync too
  return { status: "success", label: "✓ Uploaded to " + product.code };
}

async function startBulkUpload() {
  if (!bulkFiles.length || bulkRunning) return;
  bulkRunning = true;
  bulkStopRequested = false;
  bulkStartBtn.disabled = true;
  bulkCancelBtn.classList.remove("hidden");

  let done = 0, success = 0, nomatch = 0, error = 0;

  for (let i = 0; i < bulkFiles.length; i++) {
    if (bulkStopRequested) break;
    setBulkRowStatus(i, "uploading", "Uploading…");
    const result = await processBulkFile(bulkFiles[i]);
    setBulkRowStatus(i, result.status, result.label);
    done++;
    if (result.status === "success") success++;
    else if (result.status === "nomatch") nomatch++;
    else error++;
    bulkSummary.textContent = `${done} of ${bulkFiles.length} done — ${success} uploaded, ${nomatch} no match, ${error} failed`;
  }

  bulkRunning = false;
  bulkCancelBtn.classList.add("hidden");
  bulkStartBtn.disabled = false;
  bulkSummary.textContent += bulkStopRequested ? " (stopped)" : " — finished!";
  renderTable(); // show newly-attached photos in the main table right away
}

function cancelBulkUpload() {
  bulkStopRequested = true;
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

  photoDropzone?.addEventListener("click", () => photoFileInput.click());
  photoFileInput?.addEventListener("change", () => {
    if (photoFileInput.files && photoFileInput.files[0]) {
      handlePhotoFile(photoFileInput.files[0]);
    }
  });
  photoDropzone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    photoDropzone.classList.add("dragover");
  });
  photoDropzone?.addEventListener("dragleave", () => {
    photoDropzone.classList.remove("dragover");
  });
  photoDropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    photoDropzone.classList.remove("dragover");
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handlePhotoFile(file);
  });

  bulkUploadBtn?.addEventListener("click", openBulkDrawer);
  bulkCloseBtnTop?.addEventListener("click", closeBulkDrawer);
  bulkCloseBtn?.addEventListener("click", closeBulkDrawer);
  bulkOverlay?.addEventListener("click", closeBulkDrawer);
  bulkStartBtn?.addEventListener("click", startBulkUpload);
  bulkCancelBtn?.addEventListener("click", cancelBulkUpload);

  bulkDropzone?.addEventListener("click", () => bulkFileInput.click());
  bulkFileInput?.addEventListener("change", () => {
    if (bulkFileInput.files && bulkFileInput.files.length) handleBulkFilesChosen(bulkFileInput.files);
  });
  bulkDropzone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    bulkDropzone.classList.add("dragover");
  });
  bulkDropzone?.addEventListener("dragleave", () => {
    bulkDropzone.classList.remove("dragover");
  });
  bulkDropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    bulkDropzone.classList.remove("dragover");
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      handleBulkFilesChosen(e.dataTransfer.files);
    }
  });

  requireStaffLogin();
});
