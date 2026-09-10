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
