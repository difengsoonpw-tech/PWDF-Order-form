/*****************************************************
 * PWDF ORDER API V3 — with access control
 *
 * SETUP REQUIRED (one time, in the Apps Script editor):
 *   1. Click the gear icon (Project Settings) on the left.
 *   2. Scroll to "Script Properties" and click "Add script property".
 *   3. Add these two properties:
 *
 *        Property          Value
 *        ---------------   ---------------------------------------
 *        SPREADSHEET_ID    the long id from your Google Sheet URL
 *        STAFF_TOKEN       a long random password of your choosing
 *
 *   4. Click "Save script properties".
 *   5. Run the checkSetup() function once to confirm both are set.
 *
 * Script Properties are stored inside your Google account. They are NOT
 * part of this file, so they never appear in GitHub or in any browser.
 *
 * WHO CAN DO WHAT
 *   Public (no token)  : create a NEW draft order. Nothing else.
 *   Staff (with token) : search, read, list drafts, update, edit orders.
 *****************************************************/

const SHEET_HEADER = "ORDER_HEADER";
const SHEET_DETAIL = "ORDER_DETAIL";
const SHEET_SETTING = "SETTINGS";

const HEADER_COLUMNS = [
  "OrderRef",
  "Customer",
  "Company",
  "Contact",
  "CreatedDate",
  "DeliveryDate",
  "Status",
  "ItemCount"
];

const DETAIL_COLUMNS = ["OrderRef", "Code", "Name", "Remark", "Qty"];

/* Limits applied to orders submitted by the public, to prevent spam */
const PUBLIC_MAX_ITEMS = 150;
const PUBLIC_MAX_TEXT_LENGTH = 200;

/*****************************************************
 * CONFIGURATION (read from Script Properties)
 *****************************************************/
function scriptProps() {
  return PropertiesService.getScriptProperties();
}

function getConfiguredSpreadsheetId() {
  return String(scriptProps().getProperty("SPREADSHEET_ID") || "").trim();
}

function getConfiguredStaffToken() {
  return String(scriptProps().getProperty("STAFF_TOKEN") || "").trim();
}

/**
 * Run this once from the Apps Script editor to confirm setup is correct.
 * It never prints the secret values themselves.
 */
function checkSetup() {
  const id = getConfiguredSpreadsheetId();
  const token = getConfiguredStaffToken();

  Logger.log("SPREADSHEET_ID set : %s", id ? "YES" : "NO  <-- add this");
  Logger.log("STAFF_TOKEN set    : %s", token ? "YES" : "NO  <-- add this");

  if (token && token.length < 12) {
    Logger.log("WARNING: STAFF_TOKEN is short. Use at least 12 characters.");
  }

  try {
    const ss = getSpreadsheet();
    Logger.log("Spreadsheet opened : YES (%s)", ss.getName());
  } catch (err) {
    Logger.log("Spreadsheet opened : NO — %s", err);
  }
}

function getSpreadsheet() {
  const id = getConfiguredSpreadsheetId();
  if (id) {
    return SpreadsheetApp.openById(id);
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error("SPREADSHEET_ID script property is not set. Run checkSetup().");
}

/*****************************************************
 * ACCESS CONTROL
 *****************************************************/

/**
 * Compares two strings without leaking length/content through timing.
 */
function tokensMatch(supplied, expected) {
  const a = String(supplied || "");
  const b = String(expected || "");
  if (!a || !b) return false;
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Returns true only when the caller supplied the correct staff token.
 * If STAFF_TOKEN has not been configured, nobody counts as staff.
 */
function callerIsStaff(e, parsedBody) {
  const expected = getConfiguredStaffToken();
  if (!expected) return false;

  let supplied = "";
  if (e && e.parameter && e.parameter.token) {
    supplied = e.parameter.token;
  } else if (parsedBody && parsedBody.token) {
    supplied = parsedBody.token;
  }

  return tokensMatch(supplied, expected);
}

function unauthorizedResponse() {
  return jsonResponse({
    success: false,
    error: "unauthorized",
    message: "Staff access required."
  });
}

/*****************************************************
 * VALIDATION FOR PUBLIC SUBMISSIONS
 *****************************************************/
function trimToLength(value, maxLength) {
  return String(value == null ? "" : value).slice(0, maxLength);
}

function sanitizePublicOrder(data) {
  const items = Array.isArray(data.items) ? data.items : [];

  if (items.length > PUBLIC_MAX_ITEMS) {
    throw new Error("Order has too many line items.");
  }

  return {
    // orderRef deliberately omitted: the server always generates a new one,
    // so a public caller can never overwrite an existing order.
    customer: trimToLength(data.customer, PUBLIC_MAX_TEXT_LENGTH),
    company: trimToLength(data.company || data.brandName, PUBLIC_MAX_TEXT_LENGTH),
    contact: trimToLength(data.contact, PUBLIC_MAX_TEXT_LENGTH),
    deliveryDate: trimToLength(data.deliveryDate, 40),
    status: "Draft", // public submissions are always drafts
    items: items.map(item => ({
      code: trimToLength(item.code, 60),
      name: trimToLength(item.name, PUBLIC_MAX_TEXT_LENGTH),
      remark: trimToLength(item.remark, PUBLIC_MAX_TEXT_LENGTH),
      qty: Math.max(0, Math.min(100000, Number(item.qty) || 0))
    }))
  };
}

/*****************************************************
 * SHEET HELPERS
 *****************************************************/
function getSheetOrCreate(name, headerRow) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (Array.isArray(headerRow) && headerRow.length) {
      sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
    }
  }
  return sheet;
}

function normalizeHeaderValue(value) {
  return String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "");
}

function isHeaderRow(row, headerRow) {
  if (!Array.isArray(row) || !Array.isArray(headerRow)) return false;
  const rowValues = row.map(normalizeHeaderValue);
  const expected = headerRow.map(normalizeHeaderValue);
  let matchCount = 0;
  expected.forEach(expectedValue => {
    if (expectedValue && rowValues.includes(expectedValue)) {
      matchCount++;
    }
  });
  return matchCount >= Math.max(2, Math.floor(expected.length / 3));
}

function getDataRows(sheet, headerRow) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  if (isHeaderRow(values[0], headerRow)) {
    return values.slice(1);
  }
  return values;
}

function ensureSettingsSheet(settingSheet) {
  if (!settingSheet) return null;
  const nextValue = settingSheet.getRange("B2").getValue();
  if (!nextValue) {
    settingSheet.getRange("B2").setValue(1);
  }
  return settingSheet;
}

function getHeaderSheet() {
  return getSheetOrCreate(SHEET_HEADER, HEADER_COLUMNS);
}

function getDetailSheet() {
  return getSheetOrCreate(SHEET_DETAIL, DETAIL_COLUMNS);
}

/*****************************************************
 * GET REQUEST
 *****************************************************/
function doGet(e) {
  e = e || {};
  const params = e.parameter || {};

  // JSONP path — used by the customer site to submit an order.
  // This is PUBLIC, so it may only ever create a brand new draft order.
  if (params.callback && params.payload) {
    const cb = String(params.callback || "").replace(/[^\w\_\$]/g, "");
    try {
      const payload = JSON.parse(String(params.payload || "{}"));
      const staff = callerIsStaff(e, payload);
      const result = saveOrderObject(payload, staff);
      return ContentService
        .createTextOutput(`${cb}(${JSON.stringify(result)});`)
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    } catch (err) {
      const safe = { success: false, error: "save_failed" };
      return ContentService
        .createTextOutput(`${cb}(${JSON.stringify(safe)});`)
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
  }

  const action = String(params.action || "ping").toLowerCase();

  // ---- Public actions ----
  if (action === "ping") {
    return jsonResponse({ success: true, message: "PWDF API ONLINE" });
  }

  // Lets the staff login screen check a password without exposing anything.
  if (action === "verifytoken") {
    return jsonResponse({ success: callerIsStaff(e, null) });
  }

  // Catalogue for the website. Public callers get no prices and no hidden rows.
  if (action === "getproducts") {
    return jsonResponse({ success: true, products: getProducts(callerIsStaff(e, null)) });
  }

  // ---- Everything below requires the staff token ----
  if (!callerIsStaff(e, null)) {
    return unauthorizedResponse();
  }

  switch (action) {
    case "searchorders":
      return jsonResponse(searchOrders(params.query || ""));

    case "getordersbydate":
      return jsonResponse(getOrdersByDate(params.date || ""));

    case "getorder":
      return jsonResponse(fetchOrder(params.orderRef || ""));

    case "getdraftorders":
      return jsonResponse(fetchDraftOrders());

    case "getprices":
      return jsonResponse({ success: true, prices: getWholesalePrices() });

    default:
      return jsonResponse({ success: false, message: "Unknown Action" });
  }
}

/*****************************************************
 * POST REQUEST
 *****************************************************/
function parsePostBody(e) {
  if (e && e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }

  if (e && e.postData && e.postData.contents) {
    const contents = e.postData.contents;
    if (typeof contents === "string" && contents.indexOf("payload=") === 0) {
      const raw = contents.substring("payload=".length);
      try {
        return JSON.parse(decodeURIComponent(raw));
      } catch (innerErr) {
        return JSON.parse(contents);
      }
    }
    return JSON.parse(contents);
  }

  throw new Error("No POST data received");
}

function doPost(e) {
  try {
    const data = parsePostBody(e);
    const staff = callerIsStaff(e, data);
    const action = String(data.action || "").toLowerCase();

    if (action === "updateorder") {
      if (!staff) return unauthorizedResponse();
      return updateOrder(data.orderRef || "", data.updates || {});
    }

    if (action === "saveproduct") {
      if (!staff) return unauthorizedResponse();
      return jsonResponse(saveProduct(data.product || data, true));
    }

    if (action === "uploadphoto") {
      if (!staff) return unauthorizedResponse();
      return jsonResponse(uploadProductPhoto(data, true));
    }

    // Public — no login. Customers submit exactly the items in their cart
    // and get back a price only for those, never the full price list.
    if (action === "calculatecart") {
      return jsonResponse(calculateCartTotal(data.items || []));
    }

    const order = data.order || data;
    return jsonResponse(saveOrderObject(order, staff));
  } catch (err) {
    return jsonResponse({ success: false, error: "request_failed" });
  }
}

/*****************************************************
 * SAVE ORDER
 *
 * isStaffRequest === false  -> always creates a NEW draft order.
 * isStaffRequest === true   -> may also update an existing order.
 *****************************************************/
function saveOrderObject(rawData, isStaffRequest) {
  const data = isStaffRequest ? (rawData || {}) : sanitizePublicOrder(rawData || {});

  const header = getHeaderSheet();
  const detail = getDetailSheet();
  const setting = ensureSettingsSheet(getSheetOrCreate(SHEET_SETTING, ["Key", "Value"]));

  const items = Array.isArray(data.items) ? data.items : [];
  const companyName = data.company || data.brandName || "";
  const status = data.status || "Draft";

  // Only staff may target an existing order reference.
  const requestedRef = isStaffRequest ? String(data.orderRef || "").trim() : "";
  const orderRef = requestedRef || generateOrderRef(setting);

  let existingIndex = -1;
  if (isStaffRequest && requestedRef) {
    const headerValues = header.getDataRange().getValues();
    existingIndex = headerValues
      .slice(1)
      .findIndex(row => String(row[0] || "").toLowerCase() === orderRef.toLowerCase());
  }

  if (existingIndex >= 0) {
    const foundRow = existingIndex + 2;

    header.getRange(foundRow, 2, 1, 3).setValues([[
      data.customer || "",
      companyName,
      data.contact || ""
    ]]);
    header.getRange(foundRow, 6).setValue(data.deliveryDate || "");
    header.getRange(foundRow, 7).setValue(status);
    header.getRange(foundRow, 8).setValue(items.length);

    clearOrderDetailRows(detail, orderRef);
  } else {
    header.appendRow([
      orderRef,
      data.customer || "",
      companyName,
      data.contact || "",
      new Date(),
      data.deliveryDate || "",
      status,
      items.length
    ]);
  }

  items.forEach(item => {
    detail.appendRow([
      orderRef,
      item.code || "",
      item.name || "",
      item.remark || "",
      item.qty || 0
    ]);
  });

  // Note: no spreadsheet URL or internal details are returned to the caller.
  return {
    success: true,
    orderRef: orderRef,
    status: status
  };
}

function clearOrderDetailRows(detailSheet, orderRef) {
  const values = detailSheet.getDataRange().getValues();
  for (let row = values.length; row > 1; row--) {
    if (String(values[row - 1][0] || "").toLowerCase() === orderRef.toLowerCase()) {
      detailSheet.deleteRow(row);
    }
  }
}

/*****************************************************
 * UPDATE ORDER  (staff only — enforced in doPost)
 *****************************************************/
function updateOrder(orderRef, updates) {
  const header = getHeaderSheet();
  const rows = header.getDataRange().getValues();
  let foundRow = null;

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || "").toLowerCase() === String(orderRef || "").toLowerCase()) {
      foundRow = i + 1;
      break;
    }
  }

  if (!foundRow) {
    return jsonResponse({ success: false, error: "Order not found" });
  }

  const updateMap = {
    customer: 2,
    company: 3,
    brandName: 3,
    contact: 4,
    deliveryDate: 6,
    status: 7
  };

  Object.keys(updates).forEach(key => {
    const col = updateMap[key];
    if (col) {
      header.getRange(foundRow, col).setValue(updates[key]);
    }
  });

  return jsonResponse({
    success: true,
    orderRef: orderRef,
    status: updates.status || "Updated"
  });
}

/*****************************************************
 * SEARCH ORDERS  (staff only — enforced in doGet)
 *****************************************************/
function searchOrders(query) {
  const trimmedQuery = String(query || "").trim();
  const lowerQuery = trimmedQuery.toLowerCase();
  if (!lowerQuery) return [];

  const header = getHeaderSheet();
  const rows = getDataRows(header, HEADER_COLUMNS);

  const mapped = rows.map(row => ({
    orderRef: row[0],
    customer: row[1],
    company: row[2],
    contact: row[3],
    createdDate: row[4],
    deliveryDate: row[5],
    status: row[6],
    itemCount: row[7],
    rowValues: row.map(cell => String(cell || "").toLowerCase())
  }));

  const exactMatches = mapped.filter(
    order => String(order.orderRef || "").trim().toLowerCase() === lowerQuery
  );
  if (exactMatches.length) {
    return exactMatches.map(({ rowValues, ...order }) => order);
  }

  return mapped
    .filter(order => order.rowValues.some(value => value.includes(lowerQuery)))
    .map(({ rowValues, ...order }) => order);
}

function normalizeDateString(d) {
  if (!d) return "";
  const value = String(d || "").trim();
  const datePart = value.split(" ")[0];
  if (datePart.indexOf("/") >= 0) {
    const parts = datePart.split("/");
    if (parts.length === 3) {
      let part1 = parts[0].trim();
      let part2 = parts[1].trim();
      let part3 = parts[2].trim();
      const year = part3.length === 4 ? part3 : `20${part3}`;
      let month = part1.padStart(2, "0");
      let day = part2.padStart(2, "0");
      if (Number(month) > 12 && Number(day) <= 12) {
        month = part2.padStart(2, "0");
        day = part1.padStart(2, "0");
      }
      return `${year}-${month}-${day}`;
    }
  }
  if (datePart.indexOf("-") >= 0) {
    const parts = datePart.split("-");
    if (parts.length === 3) {
      const [p1, p2, p3] = parts.map(part => part.trim());
      if (p1.length === 4) {
        return `${p1}-${p2.padStart(2, "0")}-${p3.padStart(2, "0")}`;
      }
      return `${p3}-${p2.padStart(2, "0")}-${p1.padStart(2, "0")}`;
    }
  }
  return value;
}

function formatSheetDate(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const stringValue = String(value || "").trim();
  if (!stringValue) return "";
  return normalizeDateString(stringValue) || stringValue;
}

function getOrdersByDate(dateStr) {
  const dateNorm = normalizeDateString(String(dateStr || "").trim());
  if (!dateNorm) return [];

  const header = getHeaderSheet();
  const rows = getDataRows(header, HEADER_COLUMNS);

  return rows
    .map(row => ({
      orderRef: row[0],
      customer: row[1],
      company: row[2],
      contact: row[3],
      orderDate: formatSheetDate(row[4]),
      deliveryDate: formatSheetDate(row[5]),
      status: row[6],
      itemCount: row[7]
    }))
    .filter(o => (o.orderDate || "").indexOf(dateNorm) !== -1);
}

/*****************************************************
 * FETCH ORDER  (staff only — enforced in doGet)
 *****************************************************/
function fetchOrder(orderRef) {
  if (!orderRef) return null;

  const header = getHeaderSheet();
  const detail = getDetailSheet();

  const headerRows = getDataRows(header, HEADER_COLUMNS);
  const orderRow = headerRows.find(
    row => String(row[0] || "").toLowerCase() === String(orderRef || "").toLowerCase()
  );

  if (!orderRow) return null;

  const items = detail
    .getDataRange()
    .getValues()
    .slice(1)
    .filter(row => String(row[0] || "").toLowerCase() === String(orderRef || "").toLowerCase())
    .map(row => ({
      code: row[1],
      name: row[2],
      remark: row[3],
      qty: row[4]
    }));

  return {
    orderRef: orderRow[0],
    customer: orderRow[1],
    company: orderRow[2],
    contact: orderRow[3],
    createdDate: orderRow[4],
    deliveryDate: orderRow[5],
    status: orderRow[6],
    itemCount: orderRow[7],
    items: items
  };
}

/*****************************************************
 * FETCH DRAFT ORDERS  (staff only — enforced in doGet)
 *****************************************************/
function fetchDraftOrders() {
  const header = getHeaderSheet();
  const rows = getDataRows(header, HEADER_COLUMNS);

  return rows
    .map(row => ({
      orderRef: row[0],
      customer: row[1],
      company: row[2],
      contact: row[3],
      createdDate: row[4],
      deliveryDate: row[5],
      status: row[6],
      itemCount: row[7]
    }))
    .filter(order => String(order.status || "").toLowerCase() === "draft");
}

/*****************************************************
 * GENERATE ORDER REF
 *****************************************************/
function generateOrderRef(settingSheet) {
  let nextNo = Number(settingSheet.getRange("B2").getValue());
  if (!nextNo) nextNo = 1;

  const today = new Date();
  const dateString = Utilities.formatDate(today, Session.getScriptTimeZone(), "yyyyMMdd");
  const orderRef = "PWDF-" + dateString + "-" + Utilities.formatString("%03d", nextNo);

  settingSheet.getRange("B2").setValue(nextNo + 1);
  return orderRef;
}

/*****************************************************
 * PRODUCT CATALOGUE  (read from the PRODUCTS tab)
 *
 * The website used to carry all 341 products inside Product.js, which meant
 * adding an item required a code change. They now live in the PRODUCTS tab
 * of this spreadsheet, so they can be edited like any spreadsheet.
 *
 * Expected columns (order does not matter, the header names do):
 *   Code | Name | Category | Options | Addon | WholesalePrice | PhotoFile | Visible
 *
 * Customers receive products WITHOUT prices, and never see hidden rows.
 * Staff (holding the token) receive prices and hidden rows too.
 *****************************************************/
const SHEET_PRODUCTS = "PRODUCTS";

function readProductSheet() {
  var sheet;
  try {
    sheet = getSpreadsheet().getSheetByName(SHEET_PRODUCTS);
  } catch (err) {
    return [];
  }
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  // Match columns by header name so the sheet can be reordered safely.
  var head = values[0].map(function (h) {
    return String(h || "").trim().toLowerCase().replace(/\s+/g, "");
  });
  function col(name) { return head.indexOf(name); }

  var iCode  = col("code");
  var iName  = col("name");
  var iCat   = col("category");
  var iOpt   = col("options");
  var iAddon = col("addon");
  var iPrice = col("wholesaleprice");
  var iPhoto = col("photofile");
  var iVis   = col("visible");

  if (iCode < 0) return [];

  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var code = String(row[iCode] || "").trim();
    if (!code) continue;

    // Google Sheets often auto-converts a "TRUE"/"FALSE" text column into a real
    // boolean on import. row[iVis] can then be the boolean `false`, and
    // `false || "TRUE"` would wrongly fall back to "TRUE" (false is falsy in JS).
    // So check for "cell is empty" explicitly instead of using ||.
    var visCell = iVis >= 0 ? row[iVis] : "TRUE";
    var visRaw = (visCell === "" || visCell === null || visCell === undefined)
      ? "TRUE"
      : String(visCell).trim().toUpperCase();
    var hidden = (visRaw === "FALSE" || visRaw === "NO" || visRaw === "0");

    out.push({
      code: code,
      name: iName  >= 0 ? String(row[iName]  || "").trim() : "",
      category: iCat >= 0 ? String(row[iCat] || "").trim() : "",
      choice: iOpt >= 0 ? String(row[iOpt]   || "").trim() : "",
      addon: iAddon >= 0 ? String(row[iAddon] || "").trim() : "",
      price: iPrice >= 0 ? (Number(row[iPrice]) || 0) : 0,
      photo: iPhoto >= 0 ? String(row[iPhoto] || "").trim() : "",
      visible: !hidden
    });
  }
  return out;
}

/**
 * Products for the website.
 * Public callers get no prices and no hidden rows.
 */
function getProducts(isStaffRequest) {
  var rows = readProductSheet();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var p = rows[i];
    if (!isStaffRequest && !p.visible) continue;
    var item = {
      code: p.code,
      name: p.name,
      category: p.category,
      choice: p.choice,
      addon: p.addon,
      photo: p.photo
    };
    if (isStaffRequest) {
      item.price = p.price;
      item.visible = p.visible;
    }
    out.push(item);
  }
  return out;
}

/*****************************************************
 * CART PRICING (public — no staff login required)
 *
 * The customer site never downloads the price list. Instead the browser
 * sends exactly the items in the customer's own cart and gets back a
 * price only for those — computed live from the PRODUCTS sheet, so it's
 * always in sync with whatever staff set in the portal. This replaces the
 * old approach of baking the entire wholesale price list into the
 * customer-facing page's source code.
 *
 * "Decoration" is a small, already-customer-disclosed surcharge for cut
 * Block/Slab cakes with the decoration add-on — same rule the site has
 * always used, just computed here instead of in the browser.
 *****************************************************/
const DECORATION_SURCHARGE = {
  "BLOCK CAKE": 10.50,
  "SLAB CAKE": 10.50
};
const CART_CALC_MAX_ITEMS = 150;

function calculateCartTotal(rawItems) {
  var items = Array.isArray(rawItems) ? rawItems.slice(0, CART_CALC_MAX_ITEMS) : [];
  var priceMap = getWholesalePrices();
  var out = [];
  var total = 0;

  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var code = trimToLength(String(it.code || "").trim(), 60);
    var qty = Math.max(0, Math.min(100000, Math.floor(Number(it.qty) || 0)));
    var category = trimToLength(String(it.category || ""), 100);
    var choice = trimToLength(String(it.choice || ""), PUBLIC_MAX_TEXT_LENGTH);
    var hasAddon = !!it.addon;

    var unitPrice = priceMap[code] || 0;
    var lineTotal = unitPrice * qty;

    var surcharge = DECORATION_SURCHARGE[category];
    if (hasAddon && surcharge &&
        ((category === "BLOCK CAKE" && choice.indexOf("45") !== -1) ||
         (category === "SLAB CAKE" && choice.indexOf("90") !== -1))) {
      lineTotal += surcharge * qty;
    }

    total += lineTotal;
    out.push({ code: code, qty: qty, unitPrice: unitPrice, lineTotal: lineTotal });
  }

  return { success: true, items: out, total: total };
}

/** Wholesale prices keyed by code, for staff pricing. */
function getWholesalePrices() {
  var rows = readProductSheet();
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].price) map[rows[i].code] = rows[i].price;
  }
  return map;
}

/**
 * Makes up a fresh, guaranteed-unique product code for a brand new product,
 * so staff never have to invent one themselves. Existing codes are never
 * touched or reused — this only looks at what's already there to avoid a clash.
 */
function generateProductCode(values, iCode, category) {
  var slug = String(category || "ITEM").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 4) || "ITEM";
  var prefix = "NEW-" + slug + "-";
  var taken = {};
  for (var r = 1; r < values.length; r++) {
    var c = String(values[r][iCode] || "").trim().toUpperCase();
    if (c.indexOf(prefix) === 0) {
      var n = parseInt(c.slice(prefix.length), 10);
      if (!isNaN(n)) taken[n] = true;
    }
  }
  var n = 1;
  while (taken[n]) n++;
  var padded = String(n);
  while (padded.length < 4) padded = "0" + padded;
  return prefix + padded;
}

/**
 * Add a brand-new product, or edit an existing one, in the PRODUCTS sheet.
 * Staff only. Pass just { code, visible } to quickly hide/show a product
 * without touching its other fields — any field left out of `data` is left
 * exactly as it was.
 *
 * data.code missing/blank -> a new product is created and a fresh code
 *                             is generated from data.category.
 * data.code matches a row -> that row is updated in place.
 */
function saveProduct(data, isStaffRequest) {
  if (!isStaffRequest) return unauthorizedPlainResult();
  if (!data || typeof data !== "object") {
    return { success: false, error: "bad_request", message: "No product data received." };
  }

  var sheet;
  try {
    sheet = getSpreadsheet().getSheetByName(SHEET_PRODUCTS);
  } catch (err) {
    return { success: false, error: "no_sheet", message: "Could not open the spreadsheet." };
  }
  if (!sheet) {
    return { success: false, error: "no_sheet", message: 'No tab named "PRODUCTS" was found.' };
  }

  var values = sheet.getDataRange().getValues();
  if (values.length < 1) {
    return { success: false, error: "empty_sheet", message: "The PRODUCTS tab has no header row." };
  }

  var head = values[0].map(function (h) {
    return String(h || "").trim().toLowerCase().replace(/\s+/g, "");
  });
  function col(name) { return head.indexOf(name); }
  var iCode  = col("code");
  var iName  = col("name");
  var iCat   = col("category");
  var iOpt   = col("options");
  var iAddon = col("addon");
  var iPrice = col("wholesaleprice");
  var iPhoto = col("photofile");
  var iVis   = col("visible");

  if (iCode < 0) {
    return { success: false, error: "no_code_column", message: 'The PRODUCTS tab needs a "Code" column.' };
  }

  var code = trimToLength(String(data.code || "").trim(), 60);
  var isNew = !code;

  if (isNew) {
    var name = trimToLength(String(data.name || "").trim(), PUBLIC_MAX_TEXT_LENGTH);
    if (!name) {
      return { success: false, error: "missing_name", message: "Enter a product name before saving." };
    }
    code = generateProductCode(values, iCode, data.category);
  }

  // Find an existing row with this exact code (case-insensitive).
  var rowNum = -1; // 1-based sheet row number
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][iCode] || "").trim().toUpperCase() === code.toUpperCase()) {
      rowNum = r + 1;
      break;
    }
  }

  var priceValue = (data.price === undefined || data.price === null || data.price === "")
    ? undefined
    : (Number(data.price) || 0);
  var visibleValue = (data.visible === undefined) ? undefined : (data.visible !== false);

  if (rowNum === -1) {
    // Brand new row.
    var newRow = [];
    for (var c2 = 0; c2 < head.length; c2++) newRow.push("");
    newRow[iCode] = code;
    if (iName  >= 0) newRow[iName]  = trimToLength(String(data.name || ""), PUBLIC_MAX_TEXT_LENGTH);
    if (iCat   >= 0) newRow[iCat]   = trimToLength(String(data.category || ""), 100);
    if (iOpt   >= 0) newRow[iOpt]   = trimToLength(String(data.choice || ""), PUBLIC_MAX_TEXT_LENGTH);
    if (iAddon >= 0) newRow[iAddon] = trimToLength(String(data.addon || ""), PUBLIC_MAX_TEXT_LENGTH);
    if (iPrice >= 0) newRow[iPrice] = priceValue === undefined ? 0 : priceValue;
    if (iPhoto >= 0) newRow[iPhoto] = trimToLength(String(data.photo || ""), 300);
    if (iVis   >= 0) newRow[iVis]   = visibleValue === undefined ? true : visibleValue;
    sheet.appendRow(newRow);
  } else {
    // Update only the fields that were actually sent.
    if (data.name     !== undefined && iName  >= 0) sheet.getRange(rowNum, iName  + 1).setValue(trimToLength(String(data.name), PUBLIC_MAX_TEXT_LENGTH));
    if (data.category !== undefined && iCat   >= 0) sheet.getRange(rowNum, iCat   + 1).setValue(trimToLength(String(data.category), 100));
    if (data.choice   !== undefined && iOpt   >= 0) sheet.getRange(rowNum, iOpt   + 1).setValue(trimToLength(String(data.choice), PUBLIC_MAX_TEXT_LENGTH));
    if (data.addon    !== undefined && iAddon >= 0) sheet.getRange(rowNum, iAddon + 1).setValue(trimToLength(String(data.addon), PUBLIC_MAX_TEXT_LENGTH));
    if (priceValue    !== undefined && iPrice >= 0) sheet.getRange(rowNum, iPrice + 1).setValue(priceValue);
    if (data.photo    !== undefined && iPhoto >= 0) sheet.getRange(rowNum, iPhoto + 1).setValue(trimToLength(String(data.photo), 300));
    if (visibleValue  !== undefined && iVis   >= 0) sheet.getRange(rowNum, iVis   + 1).setValue(visibleValue);
  }

  return { success: true, code: code };
}

function unauthorizedPlainResult() {
  return { success: false, error: "unauthorized", message: "Staff access required." };
}

/*****************************************************
 * PRODUCT PHOTOS (Google Drive)
 *
 * Staff upload a photo from the portal. It's shrunk down in the browser
 * first, sent here as base64, saved into a Drive folder called
 * "PWDF Product Photos" (created automatically the first time), shared
 * as "anyone with the link can view", and a hotlink URL is handed back
 * for the product's Photo file column.
 *
 * This does NOT touch the PRODUCTS sheet itself — the portal still saves
 * the product normally afterwards, same as typing a photo URL by hand.
 *****************************************************/
const PHOTO_FOLDER_NAME = "PWDF Product Photos";
const MAX_PHOTO_BASE64_CHARS = 8000000; // ~6 MB decoded — generous after client-side compression
const ALLOWED_PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function getOrCreatePhotoFolder() {
  var existing = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  if (existing.hasNext()) return existing.next();
  var folder = DriveApp.createFolder(PHOTO_FOLDER_NAME);
  try {
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    // Sharing can fail on some Workspace domain policies; the individual
    // file share below still runs and is what actually matters.
  }
  return folder;
}

/**
 * data.filename    - original file name, for reference only
 * data.mimeType    - "image/jpeg" | "image/png" | "image/webp"
 * data.dataBase64  - the file's bytes, base64-encoded, no "data:" prefix
 */
function uploadProductPhoto(data, isStaffRequest) {
  if (!isStaffRequest) return unauthorizedPlainResult();
  if (!data || !data.dataBase64) {
    return { success: false, error: "no_file", message: "No photo data received." };
  }
  if (String(data.dataBase64).length > MAX_PHOTO_BASE64_CHARS) {
    return { success: false, error: "too_large", message: "That photo is too large. Please try a smaller one." };
  }

  var mimeType = String(data.mimeType || "").toLowerCase();
  if (!ALLOWED_PHOTO_TYPES[mimeType]) {
    return { success: false, error: "bad_type", message: "Only JPG, PNG or WEBP photos are supported." };
  }

  var safeBase = trimToLength(String(data.filename || "product-photo"), 60)
    .replace(/[^A-Za-z0-9._-]+/g, "_") || "product-photo";
  var fileName = safeBase + "-" + new Date().getTime() + "." + ALLOWED_PHOTO_TYPES[mimeType];

  var bytes;
  try {
    bytes = Utilities.base64Decode(data.dataBase64);
  } catch (err) {
    return { success: false, error: "bad_data", message: "Could not read that photo. Please try again." };
  }

  var blob = Utilities.newBlob(bytes, mimeType, fileName);

  var folder;
  try {
    folder = getOrCreatePhotoFolder();
  } catch (err) {
    return { success: false, error: "drive_error", message: "Could not reach Google Drive for photo storage." };
  }

  var file;
  try {
    file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    return { success: false, error: "upload_failed", message: "Photo upload failed. Please try again." };
  }

  var fileId = file.getId();
  var url = "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w1000";

  return { success: true, photo: url, fileId: fileId };
}

/**
 * Run this ONCE from the editor, right after pasting this update in.
 * Photo uploads need access to Google Drive, which this script has never
 * asked for before — running this triggers that one-time permission popup
 * in a safe, controlled way, instead of a customer-facing upload hitting
 * it unexpectedly. Google will show an "unverified app" warning because
 * this is your own private script; click "Advanced", then
 * "Go to PWDF ORDER API (unsafe)", then "Allow" — that's expected and
 * normal for a script you wrote yourself.
 */
function testDriveAccess() {
  var folder = getOrCreatePhotoFolder();
  Logger.log("Drive access OK.");
  Logger.log("Photos will be stored in a Drive folder named: %s", folder.getName());
  Logger.log("Folder link: %s", folder.getUrl());
}

/**
 * Run this ONCE from the editor after importing the PRODUCTS tab,
 * to confirm the sheet is readable and looks right.
 */
function checkProductSheet() {
  var rows = readProductSheet();

  if (!rows.length) {
    Logger.log("No products found.");
    Logger.log("Check that a tab named exactly PRODUCTS exists and has a header row");
    Logger.log("with a column called Code.");
    return;
  }

  var priced = 0, hidden = 0, cats = {};
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].price > 0) priced++;
    if (!rows[i].visible) hidden++;
    cats[rows[i].category] = true;
  }

  Logger.log("Products read      : %s", rows.length);
  Logger.log("With a price       : %s", priced);
  Logger.log("Hidden from customers: %s", hidden);
  Logger.log("Categories         : %s", Object.keys(cats).length);
  Logger.log("First product      : %s (%s) RM %s", rows[0].code, rows[0].name, rows[0].price);

  if (priced < rows.length) {
    Logger.log("NOTE: %s product(s) have no price and will total as 0.", rows.length - priced);
  }
}

/*****************************************************
 * JSON RESPONSE
 *****************************************************/
function jsonResponse(obj) {
  const output = ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  try {
    if (typeof output.setHeader === "function") {
      output.setHeader("Access-Control-Allow-Origin", "*");
      output.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      output.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
  } catch (e) {
    // ignore if setHeader is not supported in this runtime
  }
  return output;
}

function doOptions(e) {
  const output = ContentService.createTextOutput("").setMimeType(ContentService.MimeType.TEXT);
  try {
    if (typeof output.setHeader === "function") {
      output.setHeader("Access-Control-Allow-Origin", "*");
      output.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      output.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
  } catch (err) {
    // ignore
  }
  return output;
}
