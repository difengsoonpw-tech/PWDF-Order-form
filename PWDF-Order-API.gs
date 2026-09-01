/*****************************************************
 * PWDF ORDER API V2
 *****************************************************/
const SHEET_HEADER = "ORDER_HEADER";
const SHEET_DETAIL = "ORDER_DETAIL";
const SHEET_SETTING = "SETTINGS";
// Set this to your target spreadsheet ID (the long id in the sheet URL)
const SPREADSHEET_ID = "1WYnM_rFCWDqGtPbHPcW8aYRb19I1ZfgyPO9E6o860rE";

function getSpreadsheet() {
  try {
    if (SPREADSHEET_ID && SPREADSHEET_ID.indexOf("PASTE_") === -1) {
      return SpreadsheetApp.openById(SPREADSHEET_ID);
    }
  } catch (e) {
    Logger.log("openById failed, falling back to getActiveSpreadsheet: %s", e);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

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

/*****************************************************
 * GET REQUEST
 *****************************************************/
function doGet(e) {
  const action = (e.parameter.action || "ping").toLowerCase();

  switch (action) {
    case "ping":
      return jsonResponse({
        success: true,
        message: "PWDF API ONLINE"
      });

    case "searchorders":
      return jsonResponse(searchOrders(e.parameter.query || ""));

    case "getordersbydate":
      return jsonResponse(getOrdersByDate(e.parameter.date || ""));

    case "getorder":
      return jsonResponse(fetchOrder(e.parameter.orderRef || ""));

    case "getdraftorders":
      return jsonResponse(fetchDraftOrders());

    default:
      return jsonResponse({
        success: false,
        message: "Unknown Action",
        receivedAction: e.parameter.action,
        loweredAction: action,
        params: e.parameter
      });
  }
}

/*****************************************************
 * POST REQUEST
 *****************************************************/
function doPost(e) {
  try {
    var data;
    if (e.parameter && e.parameter.payload) {
      data = JSON.parse(e.parameter.payload);
    } else if (e.postData && e.postData.contents) {
      // Some clients (or Apps Script contexts) deliver form-encoded bodies
      // in e.postData.contents as a URL-encoded string like "payload=%7B...%7D".
      // Try to handle that robustly by extracting and decoding the payload value.
      var contents = e.postData.contents;
      if (typeof contents === 'string' && contents.indexOf('payload=') === 0) {
        var raw = contents.substring('payload='.length);
        try {
          data = JSON.parse(decodeURIComponent(raw));
        } catch (innerErr) {
          // Fall back to attempting to parse the raw contents directly
          data = JSON.parse(contents);
        }
      } else {
        data = JSON.parse(contents);
      }
    } else {
      throw new Error('No POST data received');
    }

    const action = (data.action || "").toLowerCase();

    if (action === "updateorder") {
      return updateOrder(data.orderRef || "", data.updates || {});
    }

    return saveOrder(data.order || data);
  } catch (err) {
    return jsonResponse({
      success: false,
      error: err.toString()
    });
  }
}

/*****************************************************
 * SAVE ORDER
 *****************************************************/
function saveOrder(data) {
  const ss = getSpreadsheet();
  const header = getSheetOrCreate(SHEET_HEADER, [
    "OrderRef",
    "Customer",
    "Company",
    "Contact",
    "CreatedDate",
    "DeliveryDate",
    "Status",
    "ItemCount"
  ]);
  const detail = getSheetOrCreate(SHEET_DETAIL, [
    "OrderRef",
    "Code",
    "Name",
    "Remark",
    "Qty"
  ]);
  const setting = ensureSettingsSheet(getSheetOrCreate(SHEET_SETTING, ["Key", "Value"]));

  const orderRef = String(data.orderRef || generateOrderRef(setting)).trim();
  const items = Array.isArray(data.items) ? data.items : [];
  const companyName = data.company || data.brandName || "";
  const status = data.status || "Draft";

  const headerValues = header.getDataRange().getValues();
  const existingIndex = headerValues.slice(1).findIndex(row => String(row[0] || "").toLowerCase() === orderRef.toLowerCase());

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
    Logger.log("Updated order %s at row %s in sheet %s of %s", orderRef, foundRow, header.getName(), ss.getUrl());
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
    Logger.log("Appended order %s to sheet %s of %s", orderRef, header.getName(), ss.getUrl());
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

  const savedRow = (() => {
    try {
      const lastRow = header.getLastRow();
      return lastRow;
    } catch (e) {
      return null;
    }
  })();

  return jsonResponse({
    success: true,
    orderRef: orderRef,
    status: status,
    debug: {
      spreadsheetUrl: ss ? ss.getUrl() : null,
      sheetName: header.getName(),
      savedRow: savedRow
    }
  });
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
 * UPDATE ORDER
 *****************************************************/
function updateOrder(orderRef, updates) {
  const header = getSheetOrCreate(SHEET_HEADER, [
    "OrderRef",
    "Customer",
    "Company",
    "Contact",
    "CreatedDate",
    "DeliveryDate",
    "Status",
    "ItemCount"
  ]);
  const rows = header.getDataRange().getValues();
  let foundRow = null;

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || "").toLowerCase() === String(orderRef || "").toLowerCase()) {
      foundRow = i + 1;
      break;
    }
  }

  if (!foundRow) {
    return jsonResponse({
      success: false,
      error: "Order not found"
    });
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
 * SEARCH ORDERS
 *****************************************************/
function searchOrders(query) {
  const trimmedQuery = String(query || "").trim();
  const lowerQuery = trimmedQuery.toLowerCase();
  if (!lowerQuery) return [];

  const header = getSheetOrCreate(SHEET_HEADER, [
    "OrderRef",
    "Customer",
    "Company",
    "Contact",
    "CreatedDate",
    "DeliveryDate",
    "Status",
    "ItemCount"
  ]);
  const rows = getDataRows(header, [
    "OrderRef",
    "Customer",
    "Company",
    "Contact",
    "CreatedDate",
    "DeliveryDate",
    "Status",
    "ItemCount"
  ]);

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

  const exactMatches = mapped.filter(order => String(order.orderRef || "").trim().toLowerCase() === lowerQuery);
  if (exactMatches.length) {
    return exactMatches.map(({ rowValues, ...order }) => order);
  }

  return mapped
    .filter(order => {
      return order.rowValues.some(value => value.includes(lowerQuery));
    })
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
      // If first part is month > 12, swap to support dd/mm/yyyy too
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

  const header = getSheetOrCreate(SHEET_HEADER, [
    "OrderRef",
    "Customer",
    "Company",
    "Contact",
    "CreatedDate",
    "DeliveryDate",
    "Status",
    "ItemCount"
  ]);

  const rows = getDataRows(header, [
    "OrderRef",
    "Customer",
    "Company",
    "Contact",
    "CreatedDate",
    "DeliveryDate",
    "Status",
    "ItemCount"
  ]);

  // match by order date only (string match on yyyy-MM-dd)
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
    .filter(o => {
      const orderDate = o.orderDate || "";
      return orderDate.indexOf(dateNorm) !== -1;
    });
}

/*****************************************************
 * FETCH ORDER
 *****************************************************/
function fetchOrder(orderRef) {
  if (!orderRef) return null;

  const header = getSheetOrCreate(SHEET_HEADER, [
    "OrderRef",
    "Customer",
    "Company",
    "Contact",
    "CreatedDate",
    "DeliveryDate",
    "Status",
    "ItemCount"
  ]);
  const detail = getSheetOrCreate(SHEET_DETAIL, [
    "OrderRef",
    "Code",
    "Name",
    "Remark",
    "Qty"
  ]);

  const headerRows = getDataRows(header, [
    "OrderRef",
    "Customer",
    "Company",
    "Contact",
    "CreatedDate",
    "DeliveryDate",
    "Status",
    "ItemCount"
  ]);
  const orderRow = headerRows.find(row => String(row[0] || "").toLowerCase() === String(orderRef || "").toLowerCase());

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
 * FETCH DRAFT ORDERS
 *****************************************************/
function fetchDraftOrders() {
  const header = getSheetOrCreate(SHEET_HEADER, [
    "OrderRef",
    "Customer",
    "Company",
    "Contact",
    "CreatedDate",
    "DeliveryDate",
    "Status",
    "ItemCount"
  ]);

  const rows = getDataRows(header, [
    "OrderRef",
    "Customer",
    "Company",
    "Contact",
    "CreatedDate",
    "DeliveryDate",
    "Status",
    "ItemCount"
  ]);

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
  const dateString = Utilities.formatDate(
    today,
    Session.getScriptTimeZone(),
    "yyyyMMdd"
  );

  const orderRef = "PWDF-" + dateString + "-" + Utilities.formatString("%03d", nextNo);

  settingSheet.getRange("B2").setValue(nextNo + 1);
  return orderRef;
}

/*****************************************************
 * JSON RESPONSE
 *****************************************************/
function jsonResponse(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  try {
    // Prefer setting CORS headers when available
    if (typeof output.setHeader === 'function') {
      output.setHeader('Access-Control-Allow-Origin', '*');
      output.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      output.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
  } catch (e) {
    // ignore if setHeader not supported in this runtime
  }
  return output;
}

// Handle preflight OPTIONS requests for CORS
function doOptions(e) {
  const output = ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
  try {
    if (typeof output.setHeader === 'function') {
      output.setHeader('Access-Control-Allow-Origin', '*');
      output.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      output.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
  } catch (err) {
    // ignore
  }
  return output;
}

/*****************************************************
 * TEST API
 *****************************************************/
function testAPI() {
  const payload = {
    customer: "TEST CUSTOMER",
    brandName: "TEST BRAND",
    contact: "0123456789",
    deliveryDate: "2026-08-20",
    items: [
      {
        code: "TEST001",
        name: "Chocolate Cake",
        remark: "CUT",
        qty: 2
      }
    ]
  };

  const fake = {
    postData: {
      contents: JSON.stringify(payload)
    }
  };

  Logger.log(doPost(fake).getContent());
}
