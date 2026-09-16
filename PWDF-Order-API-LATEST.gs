/*****************************************************
 * PWDF ORDER API V3 — with access control
 *
 * SETUP REQUIRED (one time, in the Apps Script editor):
 *   1. Click the gear icon (Project Settings) on the left.
 *   2. Scroll to "Script Properties" and click "Add script property".
 *   3. Add these properties:
 *
 *        Property          Value
 *        ---------------   ---------------------------------------
 *        SPREADSHEET_ID    the long id from your Google Sheet URL
 *        STAFF_TOKEN       a long random password of your choosing
 *        SALES_EMAIL       your own email — gets a message the moment a
 *                           customer places a brand-new order (optional;
 *                           leave blank to turn this alert off)
 *        OP_EMAIL          your Operations team's email — gets a message
 *                           automatically once YOU confirm an order
 *                           (optional; several addresses, comma-separated,
 *                           if more than one person should get it)
 *
 *   4. Click "Save script properties".
 *   5. Run the checkSetup() function once to confirm everything is set.
 *
 * Script Properties are stored inside your Google account. They are NOT
 * part of this file, so they never appear in GitHub or in any browser.
 *
 * WHO CAN DO WHAT
 *   Public (no token)  : create a NEW draft order. Nothing else.
 *   Staff (with token) : search, read, list drafts, update, edit orders.
 *
 * THE TWO AUTOMATIC EMAILS, IN PLAIN WORDS
 *   1. Customer submits an order on the website
 *        -> order is saved as status "Draft"
 *        -> if SALES_EMAIL is set, YOU get an email right away so you know
 *           to go check it — this is the "someone just ordered" alert.
 *   2. You open the dashboard, review the draft, and change its status to
 *      "Confirmed"
 *        -> if OP_EMAIL is set, Operations gets an email right away with
 *           the full order — this is the "please prepare this" alert.
 *   Neither email is required for the order system to work — they're both
 *   just convenience notifications. Leaving a property blank simply means
 *   that particular email never gets sent; nothing else breaks.
 *****************************************************/

const SHEET_HEADER = "ORDER_HEADER";
const SHEET_DETAIL = "ORDER_DETAIL";
const SHEET_SETTING = "SETTINGS";
// Deliberately named BC_CUSTOMERS, not CUSTOMERS — many businesses already
// keep a "CUSTOMERS" tab for something else entirely (e.g. a full WhatsApp
// lead list, including brand-new leads who've never actually ordered). This
// tab is intentionally separate and much narrower: only the customers who
// exist in Business Central with a real address, matched to a delivery
// area. This code never reads or writes any other tab, whatever it's named.
const SHEET_CUSTOMERS = "BC_CUSTOMERS";

// A small staff-maintained directory: Company Name -> Delivery Area, built
// from your Business Central customer export. Lets a returning customer's
// delivery area be filled in automatically instead of asking them to pick
// from the (staff-oriented) area dropdown themselves. New leads not yet in
// here just fall back to the normal manual area picker (Other/Not-listed
// included) — nothing breaks for them, this is purely a shortcut.
// Column C is optional and was added later, so an existing two-column
// BC_CUSTOMERS sheet keeps working untouched. It holds the customer's OTHER
// name — whichever of the pair column A doesn't have. A shop trading as
// "KORE" may be registered as "IO GROUP SDN BHD"; put one in A and the other
// in C and either one typed into the order form finds the same delivery
// area. The code never assumes which is which.
const CUSTOMERS_COLUMNS = ["Company Name", "Delivery Area", "Also Known As"];

const HEADER_COLUMNS = [
  "OrderRef",
  "Customer",
  "Company",
  "Contact",
  "CreatedDate",
  "DeliveryDate",
  "Status",
  "ItemCount",
  "OpSentDate",
  "DeliveryArea"
];

// Column position (1-based) of OpSentDate — blank means "not yet sent to
// Operations", any value means "sent" (we store the timestamp it was sent).
const OP_SENT_COLUMN = 9;

// Column position (1-based) of DeliveryArea — the human-readable
// "State - Area" label for which delivery-day group the order belongs to.
const DELIVERY_AREA_COLUMN = 10;

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
  const salesEmail = String(scriptProps().getProperty("SALES_EMAIL") || "").trim();
  const opEmail = String(scriptProps().getProperty("OP_EMAIL") || "").trim();

  Logger.log("SPREADSHEET_ID set : %s", id ? "YES" : "NO  <-- add this");
  Logger.log("STAFF_TOKEN set    : %s", token ? "YES" : "NO  <-- add this");
  Logger.log("SALES_EMAIL set    : %s", salesEmail ? "YES (" + salesEmail + ")" : "NO — you will NOT be emailed when a customer places a new order");
  Logger.log("OP_EMAIL set       : %s", opEmail ? "YES (" + opEmail + ")" : "NO — Operations will NOT be emailed automatically when you confirm an order");

  const sendAsWanted = String(scriptProps().getProperty("SEND_AS") || "").trim();
  if (!sendAsWanted) {
    Logger.log("SEND_AS set        : NO — alerts will be sent from this Google account's own address");
  } else if (configuredSendAsAlias()) {
    Logger.log("SEND_AS set        : YES (%s) and verified — alerts will come FROM this address", sendAsWanted);
  } else {
    Logger.log("SEND_AS set        : %s, but NOT verified in Gmail yet — see the note logged just above", sendAsWanted);
  }

  if (!emailQueueEnabled()) {
    Logger.log("EMAIL_VIA_QUEUE   : NO — alerts are sent straight from this Google account (they may land in Junk)");
  } else {
    Logger.log("EMAIL_VIA_QUEUE   : YES — alerts are written to the EMAIL_QUEUE tab for Power Automate to send from Outlook");
    const queue = pendingEmailSummary();
    if (!queue.count) {
      Logger.log("  Queue is empty — Power Automate has picked everything up.");
    } else if (queue.oldestMinutes <= 20) {
      Logger.log("  %s email(s) waiting, oldest %s minute(s) old — normal, the flow runs every few minutes.", queue.count, queue.oldestMinutes);
    } else {
      // Queueing always "succeeds", so a flow that has stopped running is
      // otherwise completely silent. This is the only place it shows up.
      Logger.log("  WARNING: %s email(s) still waiting, oldest %s minute(s) old.", queue.count, queue.oldestMinutes);
      Logger.log("  Power Automate does not look to be picking them up. Check the flow's run history —");
      Logger.log("  a flow that is turned off or erroring means NOBODY is being emailed about new orders.");
    }
  }

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

/* Opening the spreadsheet is a round trip, and a single request used to do
   it a dozen times over. Apps Script gives every request a fresh global
   scope, so remembering it in a module-level variable lasts exactly one
   request — long enough to help, too short to ever go stale. */
let SPREADSHEET_MEMO = null;

function getSpreadsheet() {
  if (SPREADSHEET_MEMO) return SPREADSHEET_MEMO;
  const id = getConfiguredSpreadsheetId();
  if (id) {
    SPREADSHEET_MEMO = SpreadsheetApp.openById(id);
    return SPREADSHEET_MEMO;
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    SPREADSHEET_MEMO = active;
    return SPREADSHEET_MEMO;
  }
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

  // Customers are deliberately NOT asked for a delivery area or a delivery
  // date any more. They can't reliably know which delivery day their address
  // falls on, and a wrong guess turned into a missed delivery. Sales sets the
  // real date in the dashboard afterwards, using the area hint from
  // BC_CUSTOMERS. Anything a caller sends in those fields is ignored rather
  // than trusted.
  return {
    // orderRef deliberately omitted: the server always generates a new one,
    // so a public caller can never overwrite an existing order.
    customer: trimToLength(data.customer, PUBLIC_MAX_TEXT_LENGTH),
    company: trimToLength(data.company || data.brandName, PUBLIC_MAX_TEXT_LENGTH),
    contact: trimToLength(data.contact, PUBLIC_MAX_TEXT_LENGTH),
    deliveryDate: "",
    deliveryArea: "",
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
 * DELIVERY DATE RULES
 *
 * Universal rule for the whole business — orders need at least
 * DELIVERY_LEAD_WORKING_DAYS working days' notice, and Sunday is never a
 * valid delivery day anywhere. This applies on top of (in addition to) the
 * per-area delivery-day rules below.
 *
 * DAILY ORDER CUTOFF — an order placed at or after DELIVERY_ORDER_CUTOFF_HOUR:
 * DELIVERY_ORDER_CUTOFF_MINUTE (business time, i.e. Session.getScriptTimeZone())
 * is treated as if it came in the NEXT calendar day for lead-time counting
 * purposes — e.g. an order at 12:45pm today counts its 3 working days from
 * tomorrow, not today. An order at 12:15pm still counts from today.
 *****************************************************/
const DELIVERY_LEAD_WORKING_DAYS = 3;
const DELIVERY_CLOSED_WEEKDAY_ISO = "7"; // Sunday, using Utilities.formatDate's "u" pattern (1=Mon..7=Sun)
const DELIVERY_ORDER_CUTOFF_HOUR = 12;
const DELIVERY_ORDER_CUTOFF_MINUTE = 30; // 12:30 PM

function isSundayInBusinessTz(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "u") === DELIVERY_CLOSED_WEEKDAY_ISO;
}

/** True once the given moment's business-timezone clock time is at or past the daily cutoff. */
function isPastOrderCutoff(date) {
  const tz = Session.getScriptTimeZone();
  const hour = Number(Utilities.formatDate(date, tz, "H"));
  const minute = Number(Utilities.formatDate(date, tz, "m"));
  if (hour > DELIVERY_ORDER_CUTOFF_HOUR) return true;
  if (hour < DELIVERY_ORDER_CUTOFF_HOUR) return false;
  return minute >= DELIVERY_ORDER_CUTOFF_MINUTE;
}

/**
 * The date lead-time counting should start FROM — "now" normally, or
 * "tomorrow" if the daily cutoff has already passed for today. Working-day
 * counting (below) always adds at least one more day on top of this.
 */
function getEffectiveOrderStartMoment() {
  const now = new Date();
  return isPastOrderCutoff(now) ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : now;
}

function computeEarliestDeliveryDateStr() {
  const tz = Session.getScriptTimeZone();
  let date = getEffectiveOrderStartMoment();
  let count = 0;
  while (count < DELIVERY_LEAD_WORKING_DAYS) {
    date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    if (!isSundayInBusinessTz(date)) count++;
  }
  return Utilities.formatDate(date, tz, "yyyy-MM-dd");
}

function isValidPublicDeliveryDate(dateStr) {
  const value = String(dateStr || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parts = value.split("-").map(Number);
  const picked = new Date(parts[0], parts[1] - 1, parts[2]);
  if (isNaN(picked.getTime())) return false;
  if (isSundayInBusinessTz(picked)) return false;

  // Both sides are yyyy-MM-dd strings, so a plain string comparison is a
  // safe stand-in for a chronological one.
  return value >= computeEarliestDeliveryDateStr();
}

/*****************************************************
 * PER-AREA DELIVERY DAYS
 *
 * Source: "Outstation & Local Transport Schedule and Charges — from
 * 22/6/2026 until further notice" (the delivery schedule PDF).
 *
 * Each area lists the day(s) the Shah Alam factory truck runs there
 * ("days", as ISO weekday numbers: 1=Monday ... 7=Sunday) and an "offset":
 *
 *   offset 0  -> the listed day IS the delivery day (Selangor "Local"
 *                areas, and Negeri Sembilan — the PDF marks these
 *                "(Delivery day)").
 *   offset 1  -> the listed day is the PICK-UP day from the factory;
 *                the actual delivery to the customer is the next day
 *                (every outstation state, including Melaka — applied
 *                uniformly EXCEPT where a row's own label in the PDF
 *                explicitly overrides it, see below).
 *
 * Two rows under PERAK are explicit exceptions to the outstation-is-
 * pickup-day default: "Ipoh Town / Tg Malim / Ulu Kinta" (Tuesday &
 * Saturday) and "Cameron Highland" (Tuesday) are BOTH labelled
 * "(delivery day)" right in the PDF, not "(pickup day)" — so unlike
 * every other row in Perak, these two use offset 0, the listed day IS
 * the delivery day. (Teluk Intan/Taiping/etc and Gerik, the other two
 * Perak rows, ARE explicitly "(pickup day)" and keep offset 1 as
 * normal.)
 *
 * Kuala Lumpur itself isn't a separate row in the PDF — it's covered by
 * the "Klang Valley..." Selangor-local row below (Monday-Saturday),
 * matching "for KL we deliver every day except Sunday".
 *
 * A delivery date landing on Sunday is always excluded automatically
 * (areaDeliveryWeekdays() below strips it out) — nothing area-specific
 * needs to be done for that.
 *****************************************************/
const DELIVERY_AREAS = [
  // ---- Selangor (Local) — offset 0, listed day is the delivery day ----
  { id: "SELANGOR-1", state: "Selangor (Local)", area: "Sg Besar / K. Selangor / Sekinchan / Tg Karang / Kuala Kubu Bharu / Sabak Bernam", days: [2, 6], offset: 0 },
  { id: "SELANGOR-2", state: "Selangor (Local)", area: "Rawang / B. Beruntung / Batang Kali / Setia Eco Templer / Serendah / Lumpang", days: [2, 6], offset: 0 },
  { id: "SELANGOR-3", state: "Selangor (Local)", area: "Banting / B.S.P / Jenjarom", days: [2, 5], offset: 0 },
  { id: "SELANGOR-4", state: "Selangor (Local)", area: "Kajang / Semenyih / B. Bukit Mahkota / Bandar Seri Putra (Bangi) / Beranang / Sg Long", days: [1, 5], offset: 0 },
  { id: "SELANGOR-5", state: "Selangor (Local)", area: "Puncak Alam / Bukit Raja / Saujana Utama / Desa Coalfield / Sg Buloh / Pulau Indah / Kapar / Meru", days: [1, 4], offset: 0 },
  { id: "SELANGOR-6", state: "Selangor (Local)", area: "Setia Alam / Eco Ardence / Denai Alam / U12 Shah Alam / UITM Puncak Perdana / Alam Budiman / Setia Eco Park", days: [1, 4, 6], offset: 0 },
  { id: "SELANGOR-7", state: "Selangor (Local)", area: "Klang Valley, Bandar Baru Bangi, Putrajaya, Cyberjaya, Bandar Southville, Rimbayu (incl. Kuala Lumpur)", days: [1, 2, 3, 4, 5, 6], offset: 0 },
  { id: "SELANGOR-8", state: "Selangor (Local)", area: "KLIA / Dengkil / Kota Warisan / Sepang / Teluk Panglima Garang", days: [2, 5, 6], offset: 0 },
  { id: "SELANGOR-9", state: "Selangor (Local)", area: "Tanjung Sepat", days: [2, 5], offset: 0 },
  { id: "SELANGOR-10", state: "Selangor (Local)", area: "Hulu Langat Bt. 9", days: [3], offset: 0 },

  // ---- Negeri Sembilan — offset 0, listed day is the delivery day ----
  { id: "NS-1", state: "Negeri Sembilan", area: "Seremban Town / Simpang Durian / Jempol / Rembau", days: [1], offset: 0 },
  { id: "NS-2", state: "Negeri Sembilan", area: "Seremban 2", days: [4], offset: 0 },
  { id: "NS-3", state: "Negeri Sembilan", area: "Senawang, Nilai, Lenggeng", days: [1], offset: 0 },
  { id: "NS-4", state: "Negeri Sembilan", area: "Kuala Pilah / Kuala Klawang / Titi", days: [1], offset: 0 },
  { id: "NS-5", state: "Negeri Sembilan", area: "Mambau / Lukut / Port Dickson / Teluk Kemang", days: [1, 4], offset: 0 },
  { id: "NS-6", state: "Negeri Sembilan", area: "Sendayan", days: [4], offset: 0 },
  { id: "NS-7", state: "Negeri Sembilan", area: "Gemas", days: [3], offset: 0 },

  // ---- Everywhere else (outstation) — offset 1, listed day is pickup day ----
  { id: "PERLIS-1", state: "Perlis", area: "Kangar / Arau", days: [3], offset: 1 },

  { id: "KEDAH-1", state: "Kedah", area: "Sintok / Changlun / Kodiang", days: [3], offset: 1 },
  { id: "KEDAH-2", state: "Kedah", area: "Sik", days: [1], offset: 1 },
  { id: "KEDAH-3", state: "Kedah", area: "Alor Setar / Kulim / Jitra / Sg Petani / Pendang / Lunas / Kupang / Kuala Ketil / Padang Serai / Gurun / Baling", days: [1, 3], offset: 1 },
  { id: "KEDAH-4", state: "Kedah", area: "Langkawi", days: [5], offset: 1 },

  { id: "PENANG-1", state: "Penang", area: "Penang Island", days: [1, 3, 4], offset: 1 },
  { id: "PENANG-2", state: "Penang", area: "Butterworth / Perai / Bukit Mertajam / Simpang Empat / Batu Kawan / Sg Jawi", days: [1, 3, 4], offset: 1 },
  { id: "PENANG-3", state: "Penang", area: "Kepala Batas / Pokok Sena", days: [1, 3, 4], offset: 1 },
  { id: "PENANG-4", state: "Penang", area: "Nibong Tebal", days: [1, 3], offset: 1 },

  // These two are the PDF's explicit "(delivery day)" exceptions within
  // Perak — offset 0, not the outstation default of 1 (see comment above).
  { id: "PERAK-1", state: "Perak", area: "Ipoh Town / Tg Malim / Ulu Kinta", days: [2, 6], offset: 0 },
  { id: "PERAK-2", state: "Perak", area: "Cameron Highland", days: [2], offset: 0 },
  { id: "PERAK-3", state: "Perak", area: "Teluk Intan / Taiping / Setiawan / Manjung / Kuala Kangsar / Parit Buntar / Kampar / Tapah / Batu Gajah / Lumut / Seri Iskandar", days: [4], offset: 1 },
  { id: "PERAK-4", state: "Perak", area: "Gerik", days: [1], offset: 1 },

  { id: "PAHANG-1", state: "Pahang", area: "Genting Highland", days: [1], offset: 1 },
  { id: "PAHANG-2", state: "Pahang", area: "Raub / Bentong", days: [2, 5], offset: 1 },
  { id: "PAHANG-3", state: "Pahang", area: "Kuantan", days: [2, 3, 5], offset: 1 },
  { id: "PAHANG-4", state: "Pahang", area: "Temerloh / Jerantut / Mentakab / Bera / Pekan / Muadzam Shah", days: [2, 3, 5], offset: 1 },
  { id: "PAHANG-5", state: "Pahang", area: "Jengka / Kuala Lipis / Maran / Kuala Rompin", days: [2, 5], offset: 1 },

  { id: "EASTCOAST-1", state: "East Coast", area: "Terengganu", days: [2, 5], offset: 1 },
  { id: "EASTCOAST-2", state: "East Coast", area: "Kelantan", days: [2, 5], offset: 1 },

  { id: "JOHOR-1", state: "Johor", area: "Johor Bahru / Pasir Gudang / Ulu Tiram / Kulai / Kota Tinggi / Skudai / Masai / Nusajaya / Bandar Penawar / Desaru / Iskandar Puteri / Larkin / Pontian", days: [5], offset: 1 },
  { id: "JOHOR-2", state: "Johor", area: "Segamat / Tangkak / Muar / Batu Pahat / Parit Raja / Simpang Renggam / Kluang / Yong Peng / Pagoh", days: [3], offset: 1 },

  { id: "MELAKA-1", state: "Melaka", area: "Melaka Town / Ayer Keroh / Batu Berendam / Alor Gajah / Sg Udang / Krubong / Merlimau / Jasin / Cheng / Bkt Baru / Bemban / Durian Tunggal", days: [2], offset: 1 },

  // ---- Fallback for anywhere not covered above (e.g. East Malaysia, or a
  // town simply left off the schedule) — only the universal 3-working-day /
  // no-Sunday rule applies (days: every non-Sunday weekday, offset 0), and
  // the order is clearly flagged so staff know to confirm the exact
  // delivery day with the customer directly. Always listed last. ----
  { id: "OTHER", state: "Other", area: "My area isn't listed — we'll confirm your delivery day with you", days: [1, 2, 3, 4, 5, 6], offset: 0 }
];

const OTHER_AREA_ID = "OTHER";
function isUnlistedAreaOrder(order) {
  const other = getAreaById(OTHER_AREA_ID);
  return !!other && String(order && order.deliveryArea || "") === areaLabel(other);
}

const WEEKDAY_ISO_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function isoWeekdayName(iso) {
  return WEEKDAY_ISO_NAMES[iso - 1] || "";
}

function getAreaById(id) {
  const norm = String(id || "").trim();
  if (!norm) return null;
  return DELIVERY_AREAS.find(a => a.id === norm) || null;
}

// Every area's human-readable "State - Area" label — the exact same string
// stored on each order, shown to staff, and offered as a dropdown choice in
// the BC_CUSTOMERS sheet, so there's only ever one spelling to keep in sync.
function areaLabel(area) {
  return area ? `${area.state} - ${area.area}` : "";
}

function getAllAreaLabels() {
  return DELIVERY_AREAS.map(areaLabel);
}

// Reverse of areaLabel() — turns a "State - Area" string (as picked from
// the BC_CUSTOMERS sheet's dropdown) back into an area id. Case/whitespace
// tolerant so a small typo or extra space doesn't silently break a match.
function getAreaIdByLabel(label) {
  const norm = String(label || "").trim().toLowerCase();
  if (!norm) return null;
  const found = DELIVERY_AREAS.find(a => areaLabel(a).trim().toLowerCase() === norm);
  return found ? found.id : null;
}

/**
 * Converts an area's pickup/delivery days + offset into the actual ISO
 * weekdays a customer there can be delivered to, always excluding Sunday
 * (the business is closed, no special-casing needed beyond this filter).
 */
function areaDeliveryWeekdays(area) {
  if (!area || !Array.isArray(area.days)) return [];
  const offset = area.offset || 0;
  const seen = {};
  area.days.forEach(d => {
    let iso = d + offset;
    if (iso > 7) iso -= 7;
    if (iso !== 7) seen[iso] = true; // Sunday is never a valid delivery day
  });
  return Object.keys(seen).map(Number).sort((a, b) => a - b);
}

/**
 * Earliest date that satisfies BOTH the universal lead-time/Sunday rule
 * AND the chosen area's actual delivery weekday(s). Falls back to the
 * universal-only rule if the area id isn't recognised.
 */
function computeEarliestDeliveryDateForArea(areaId) {
  const area = getAreaById(areaId);
  if (!area) return computeEarliestDeliveryDateStr();

  const allowed = areaDeliveryWeekdays(area);
  if (!allowed.length) return ""; // area has no deliverable day at all (shouldn't happen with real data)

  const tz = Session.getScriptTimeZone();
  let date = getEffectiveOrderStartMoment();
  let workingDaysCounted = 0;

  // Guard against an unexpected infinite loop — 90 calendar days is far
  // more than enough to hit every weekday combination several times over.
  for (let guard = 0; guard < 90; guard++) {
    date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    const isSunday = isSundayInBusinessTz(date);
    if (!isSunday) workingDaysCounted++;
    if (workingDaysCounted >= DELIVERY_LEAD_WORKING_DAYS && !isSunday) {
      const iso = Number(Utilities.formatDate(date, tz, "u"));
      if (allowed.indexOf(iso) !== -1) {
        return Utilities.formatDate(date, tz, "yyyy-MM-dd");
      }
    }
  }
  return "";
}

/**
 * True only if dateStr passes the universal rule (lead time + not Sunday)
 * AND its weekday is one this specific area is actually delivered on.
 */
function isValidPublicDeliveryChoice(dateStr, areaId) {
  if (!isValidPublicDeliveryDate(dateStr)) return false;

  const area = getAreaById(areaId);
  if (!area) return false;

  const parts = String(dateStr).trim().split("-").map(Number);
  const picked = new Date(parts[0], parts[1] - 1, parts[2]);
  const iso = Number(Utilities.formatDate(picked, Session.getScriptTimeZone(), "u"));

  return areaDeliveryWeekdays(area).indexOf(iso) !== -1;
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

let HEADER_SHEET_MEMO = null;

function getHeaderSheet() {
  // Setting one delivery date used to call this four times, each one paying
  // the ensureHeaderColumns cost again. Same per-request lifetime as above.
  if (HEADER_SHEET_MEMO) return HEADER_SHEET_MEMO;
  const sheet = getSheetOrCreate(SHEET_HEADER, HEADER_COLUMNS);
  ensureHeaderColumns(sheet);
  HEADER_SHEET_MEMO = sheet;
  return sheet;
}

/**
 * One-time, self-healing migration: older sheets were created before some
 * of HEADER_COLUMNS existed (e.g. "OpSentDate", then later "DeliveryArea").
 * For each expected column, if the sheet doesn't have it yet (either the
 * column doesn't exist at all, or its header cell is blank), fill in just
 * that header name — this never touches any existing order data, and it's
 * safe to run every time a sheet is opened.
 */
function ensureHeaderColumns(sheet) {
  // Read the whole header row in one go and write it back only if something
  // was actually missing. This used to be up to eleven separate spreadsheet
  // round trips on EVERY request, which is a tax paid by every customer
  // order and every dashboard click.
  const width = Math.max(sheet.getLastColumn(), HEADER_COLUMNS.length);
  const current = sheet.getRange(1, 1, 1, width).getValues()[0] || [];
  const next = current.slice();
  let changed = false;

  HEADER_COLUMNS.forEach((columnName, index) => {
    if (String(next[index] === undefined ? "" : next[index]).trim() === "") {
      next[index] = columnName;
      changed = true;
    }
  });

  if (changed) sheet.getRange(1, 1, 1, width).setValues([next]);
  return changed;
}

let DETAIL_SHEET_MEMO = null;

function getDetailSheet() {
  if (DETAIL_SHEET_MEMO) return DETAIL_SHEET_MEMO;
  DETAIL_SHEET_MEMO = getSheetOrCreate(SHEET_DETAIL, DETAIL_COLUMNS);
  return DETAIL_SHEET_MEMO;
}

function getCustomersSheet() {
  return getSheetOrCreate(SHEET_CUSTOMERS, CUSTOMERS_COLUMNS);
}

/**
 * Reads the BC_CUSTOMERS sheet (Company Name | Delivery Area) and returns
 * the usable rows as {company, areaId, areaLabel}. A row is skipped — not
 * sent to the browser with a broken area id — if the company name is
 * blank, or the Delivery Area text doesn't exactly match one of
 * DELIVERY_AREAS' own labels (e.g. a typo, or a row not filled in yet).
 * Duplicate company names are allowed in the sheet; the first match wins
 * when looked up.
 */
function getCustomerDirectory() {
  const sheet = getCustomersSheet();
  const rows = getDataRows(sheet, CUSTOMERS_COLUMNS);
  const out = [];
  rows.forEach(row => {
    const company = String(row[0] || "").trim();
    const label = String(row[1] || "").trim();
    const brand = String(row[2] || "").trim(); // optional, may not exist at all
    if (!company || !label) return;
    const areaId = getAreaIdByLabel(label);
    if (!areaId) return; // unrecognised label — skip rather than guess
    out.push({ company: company, brand: brand, areaId: areaId, areaLabel: label });
  });
  return out;
}

/**
 * Flattens a company name down to just its comparable letters and digits,
 * so harmless differences stop causing misses: capitals, punctuation
 * ("P.W.D.F." vs "PWDF"), double spaces, and the legal tail a customer
 * almost never types ("IO GROUP SDN BHD" when they'll write "IO GROUP").
 */
const COMPANY_NAME_SUFFIXES = [
  "sendirian berhad", "sdn bhd", "sdn", "bhd", "plt", "llp",
  "enterprises", "enterprise", "trading", "resources", "holdings"
];

function normalizeCompanyName(value) {
  // "&" becomes the word "and" first, so "ANNE BAKE & BREW" and
  // "Anne Bake and Brew" end up identical instead of merely similar.
  let s = String(value || "").toLowerCase().replace(/&/g, " and ");
  s = s.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (let i = 0; i < COMPANY_NAME_SUFFIXES.length; i++) {
      const tail = " " + COMPANY_NAME_SUFFIXES[i];
      // Never strip a name down to nothing — a customer literally called
      // "Enterprise" keeps its name.
      if (s.length > tail.length && s.slice(-tail.length) === tail) {
        s = s.slice(0, s.length - tail.length).trim();
        stripped = true;
      }
    }
  }
  return s;
}

/**
 * Every spelling of one name worth searching by:
 *   "C & P Coffee"  ->  "c and p coffee", "c p coffee", "candpcoffee", "cpcoffee"
 * The joined-up forms are what let "PWDF Bakery" find "P.W.D.F. Bakery Sdn.
 * Bhd.", and dropping "and" covers the customer who writes "CP Coffee".
 */
function customerNameVariants(name) {
  const base = normalizeCompanyName(name);
  if (!base) return [];
  const withoutAnd = base.replace(/\band\b/g, " ").replace(/\s+/g, " ").trim();
  const variants = [];
  [base, withoutAnd].forEach(form => {
    if (!form) return;
    [form, form.replace(/ /g, "")].forEach(key => {
      if (key && variants.indexOf(key) === -1) variants.push(key);
    });
  });
  return variants;
}

/** Both of a customer's names — company and "also known as" — in every spelling. */
function customerSearchKeys(entry) {
  const keys = [];
  [entry.company, entry.brand].forEach(name => {
    customerNameVariants(name).forEach(key => {
      if (keys.indexOf(key) === -1) keys.push(key);
    });
  });
  return keys;
}

/**
 * Given the customers a search turned up, decide whether it's safe to fill
 * the delivery area in automatically.
 *
 * Several customers matching is fine as long as they all deliver to the SAME
 * area — the answer is the same either way. If they'd go to different areas
 * the search was too vague to guess from, so we return nothing and the
 * customer picks their area from the dropdown as normal. Better a dropdown
 * than a confidently wrong delivery day.
 */
/**
 * How many single-character slips separate two names ("anne baked brew" vs
 * "anne bake brew" = 1). Deliberately named customerName* so it can never
 * collide with the similarity helpers in CustomerDB.gs — every .gs file in
 * an Apps Script project shares one namespace, and a duplicated function
 * name silently overrides the other one.
 *
 * Gives up as soon as the difference exceeds what we'd accept, so a long
 * customer list stays cheap to search.
 */
function customerNameEditDistance(a, b, giveUpAfter) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > giveUpAfter) return giveUpAfter + 1;

  let previous = [];
  for (let j = 0; j <= b.length; j++) previous[j] = j;

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let bestInRow = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      if (current[j] < bestInRow) bestInRow = current[j];
    }
    if (bestInRow > giveUpAfter) return giveUpAfter + 1; // can only get worse
    previous = current;
  }
  return previous[b.length];
}

/**
 * How much misspelling to forgive, by how much was typed. Short names get no
 * leeway at all — one slip in "KORE" could just as easily be "CORE", a
 * different customer entirely — while a long name has room for a typo.
 */
function customerTypoAllowance(length) {
  if (length < 6) return 0;
  if (length < 10) return 1;
  return 2;
}

function resolveSingleArea(entries) {
  if (!entries.length) return null;
  const first = entries[0];
  const allAgree = entries.every(e => e.areaId === first.areaId);
  if (!allAgree) return null;
  return { areaId: first.areaId, areaLabel: first.areaLabel };
}

/**
 * Looks up ONE customer by what they typed into the Brand Name box and
 * returns just that customer's delivery area, or null if we can't tell.
 *
 * Searches the company name AND the brand name (BC_CUSTOMERS column C), so
 * "IO GROUP" and "KORE" both find the same customer. Matching is forgiving:
 * capitals, punctuation and a trailing "SDN BHD" are ignored, and a partial
 * name works too — typing "IO" finds "IO GROUP" as long as no other customer
 * starting with "IO" delivers somewhere else.
 *
 * Deliberately does NOT expose the customer directory over the network. The
 * reply is only ever a delivery area — never a company name, a brand name,
 * or how many customers matched — and there is no action anywhere that hands
 * the whole BC_CUSTOMERS list to an unauthenticated caller.
 */
const CUSTOMER_MATCH_MIN_CHARS = 2;

function findCustomerMatch(companyTyped) {
  const typed = normalizeCompanyName(companyTyped);
  // One letter matches half the customer base — not worth guessing from.
  if (!typed || typed.length < CUSTOMER_MATCH_MIN_CHARS) return null;

  const typedVariants = customerNameVariants(companyTyped);
  const directory = getCustomerDirectory();

  // 1. Whole-name match on either of the customer's names.
  const exact = directory.filter(entry => {
    const keys = customerSearchKeys(entry);
    return typedVariants.some(variant => keys.indexOf(variant) !== -1);
  });
  const exactArea = resolveSingleArea(exact);
  if (exactArea) return exactArea;

  // 2. Partial: what they typed starts the name, or starts any word inside
  //    it — so "IO" finds "IO GROUP", and "bake" finds "ANNE BAKE & BREW".
  const partial = directory.filter(entry => customerSearchKeys(entry).some(key =>
    typedVariants.some(variant =>
      key.indexOf(variant) === 0 || key.split(" ").some(word => word.indexOf(variant) === 0)
    )
  ));
  const partialArea = resolveSingleArea(partial);
  if (partialArea) return partialArea;

  // 3. Last resort — forgive a typo. "ANNE BAKED & BREW" should still find
  //    "ANNE BAKE & BREW" rather than sending that customer to the dropdown.
  const allowance = customerTypoAllowance(typed.length);
  if (!allowance) return null;
  const close = directory.filter(entry => customerSearchKeys(entry).some(key =>
    typedVariants.some(variant => customerNameEditDistance(variant, key, allowance) <= allowance)
  ));
  return resolveSingleArea(close);
}

/**
 * Everything the dashboard needs to pick a delivery date for one customer:
 * their matched area, the weekdays that area is served on, and the next few
 * actual dates that qualify — so setting a date is a click, not a puzzle
 * involving a wall calendar.
 *
 * Staff-only. A customer never sees any of this; they just place the order.
 */
function getDeliveryHint(companyTyped) {
  const match = findCustomerMatch(companyTyped);
  if (!match) {
    return { success: true, match: null, suggestedDates: [], note: "This company isn't in BC_CUSTOMERS, so there's no delivery-day guidance for it yet." };
  }

  const area = getAreaById(match.areaId);
  const weekdays = area ? areaDeliveryWeekdays(area) : [];
  const suggested = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // Look ahead a fortnight — far enough to cover any weekly delivery day.
  for (let i = 1; i <= 21 && suggested.length < 5; i++) {
    cursor.setDate(cursor.getDate() + (i === 1 ? 1 : 1));
    const iso = Number(Utilities.formatDate(cursor, Session.getScriptTimeZone(), "u"));
    if (weekdays.indexOf(iso) !== -1) {
      suggested.push(Utilities.formatDate(cursor, Session.getScriptTimeZone(), "yyyy-MM-dd"));
    }
  }

  return {
    success: true,
    match: { areaId: match.areaId, areaLabel: match.areaLabel },
    deliveryWeekdays: weekdays.map(isoWeekdayName),
    suggestedDates: suggested
  };
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

      // This path can ONLY save an order. It used to ignore the payload's
      // "action" completely and save whatever it was given, so a staff
      // request that fell back to JSONP — setting a delivery date, say —
      // silently turned into "save this as an order" and reported success.
      // That wrote junk into a real order and skipped the Operations email.
      // Anything with an action of its own is refused outright: better a
      // visible error than a quiet, wrong success.
      const requested = String(payload.action || "").toLowerCase();
      if (requested && requested !== "saveorder") {
        const refused = {
          success: false,
          error: "The '" + requested + "' action can't be sent this way. Please reload the page and try again."
        };
        return ContentService
          .createTextOutput(`${cb}(${JSON.stringify(refused)});`)
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }

      const staff = callerIsStaff(e, payload);
      const result = saveOrderObject(payload, staff);
      return ContentService
        .createTextOutput(`${cb}(${JSON.stringify(result)});`)
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    } catch (err) {
      // err.message is safe to show here — the only things this code ever
      // throws deliberately are friendly validation messages (too many
      // items, an invalid delivery date), never raw internal errors.
      const safe = { success: false, error: (err && err.message) || "save_failed" };
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
    return jsonResponse({ success: true, products: getProductsCached(callerIsStaff(e, null)) });
  }

  // Public — lets the customer order page set its date-picker's earliest
  // selectable date and reject Sundays, matching the rule the server
  // actually enforces when the order is submitted.
  if (action === "getdeliveryrules") {
    return jsonResponse({
      success: true,
      leadWorkingDays: DELIVERY_LEAD_WORKING_DAYS,
      closedWeekdayIso: Number(DELIVERY_CLOSED_WEEKDAY_ISO),
      cutoffHour: DELIVERY_ORDER_CUTOFF_HOUR,
      cutoffMinute: DELIVERY_ORDER_CUTOFF_MINUTE,
      pastCutoffNow: isPastOrderCutoff(new Date()),
      earliestDate: computeEarliestDeliveryDateStr()
    });
  }

  // Public — the list of delivery areas for the dropdown, each with the
  // actual ISO weekdays (already pickup/delivery-offset-adjusted, Sunday
  // always excluded) that area can be delivered on, so the browser can
  // compute the earliest date and validate the picker without a round trip.
  if (action === "getdeliveryareas") {
    return jsonResponse({
      success: true,
      areas: DELIVERY_AREAS.map(a => ({
        id: a.id,
        state: a.state,
        area: a.area,
        allowedWeekdaysIso: areaDeliveryWeekdays(a)
      }))
    });
  }

  // Public — looks up ONE company by the exact name typed into the Brand
  // Name field (staff-maintained directory, see the BC_CUSTOMERS sheet),
  // so a returning customer's area can be filled in automatically instead
  // of asking them to pick from the area dropdown. Deliberately returns
  // only that one company's own match (or null) — NEVER the full customer
  // list. There is no action anywhere that hands the whole BC_CUSTOMERS
  // directory to an unauthenticated caller; every other customer's name
  // and delivery area stays private.
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

    case "getneedop":
      return jsonResponse(getOrdersNeedingOp());

    case "getprices":
      return jsonResponse({ success: true, prices: getWholesalePricesCached() });

    // Staff only, and deliberately so. Customers no longer see anything
    // about delivery areas, so nothing about the customer list is exposed
    // publicly any more — this is now purely a hint for whoever is setting
    // the delivery date in the dashboard.
    case "matchcustomer":
      return jsonResponse({ success: true, match: findCustomerMatch(params.company || "") });

    case "getdeliveryhint":
      return jsonResponse(getDeliveryHint(params.company || ""));

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

    if (action === "setdeliverydate") {
      if (!staff) return unauthorizedResponse();
      return setDeliveryDateAndConfirm(data.orderRef || "", data.deliveryDate || "");
    }

    if (action === "sendtoop") {
      if (!staff) return unauthorizedResponse();
      return jsonResponse(markSentToOp(data.orderRef || "", data.sent !== false));
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
    // err.message is safe to show here — the only things this code ever
    // throws deliberately are friendly validation messages (too many
    // items, an invalid delivery date), never raw internal errors.
    return jsonResponse({ success: false, error: (err && err.message) || "request_failed" });
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
    header.getRange(foundRow, DELIVERY_AREA_COLUMN).setValue(data.deliveryArea || "");

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
      items.length,
      "", // OpSentDate — blank until staff explicitly marks it sent to Operations
      data.deliveryArea || ""
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

  // Alert sales the instant a customer places a brand-new order, so you
  // don't have to keep refreshing the dashboard to notice one came in.
  // Only fires for a genuine NEW order submitted by a customer through the
  // website — never for a staff edit/re-save of an order that already
  // exists (existingIndex >= 0 means this was an update, not a new order).
  if (!isStaffRequest && existingIndex < 0) {
    // Logged so that if an email ever goes missing, "View > Executions" in
    // the Apps Script editor says exactly what happened instead of nothing.
    Logger.log("New-order sales alert: %s", JSON.stringify(notifySalesOfNewOrder(orderRef)));
  } else if (existingIndex < 0) {
    // Worth logging loudly: an order placed while you are logged into Staff
    // Mode carries your staff token, so the system treats it as YOUR order
    // and deliberately doesn't email you about your own order. That is the
    // usual reason a test order seems to send no email — test in a private/
    // incognito window to place one as a real customer would.
    Logger.log("New order created by STAFF (staff token present) — new-order sales alert deliberately skipped.");
  }

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
/*****************************************************
 * SET THE DELIVERY DATE  (staff only — enforced in doPost)
 *
 * The single action that replaces three separate steps. Customers no
 * longer pick a delivery date at all — they can't reliably know which day
 * their address is served on — so Sales sets it here, and setting it is
 * what confirms the order and tells Operations. One click, nothing left
 * half-done and nothing to remember.
 *
 * No lead-time or delivery-day rule is enforced here on purpose. Those
 * rules existed to stop a CUSTOMER picking an impossible day; staff are
 * the ones who actually know when a van is going out, including for a
 * short-notice or off-schedule delivery. A Sunday or a very close date is
 * flagged back as a `warning` for the dashboard to double-check, never
 * refused.
 *****************************************************/
function setDeliveryDateAndConfirm(orderRef, deliveryDate) {
  const ref = String(orderRef || "").trim();
  if (!ref) return jsonResponse({ success: false, error: "Which order? No order reference was given." });

  const date = String(deliveryDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonResponse({ success: false, error: "Please choose a delivery date first." });
  }
  const parts = date.split("-").map(Number);
  const parsed = new Date(parts[0], parts[1] - 1, parts[2]);
  if (isNaN(parsed.getTime()) || parsed.getFullYear() !== parts[0] || parsed.getMonth() !== parts[1] - 1 || parsed.getDate() !== parts[2]) {
    return jsonResponse({ success: false, error: "That isn't a real date." });
  }

  const warnings = [];
  if (Number(Utilities.formatDate(parsed, Session.getScriptTimeZone(), "u")) === DELIVERY_CLOSED_WEEKDAY_ISO) {
    warnings.push("That date is a Sunday, when we're normally closed.");
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (parsed.getTime() < today.getTime()) {
    warnings.push("That date is in the past.");
  }

  const updates = { deliveryDate: date, status: "Confirmed" };

  // Fill in the delivery area from BC_CUSTOMERS if the order hasn't got one.
  // Operations needs to know WHERE it's going, and the customer was never
  // asked — so the moment we know who they are, we look it up. An area
  // already on the order (set by hand) is left exactly as it is.
  const existing = fetchOrder(ref);
  if (existing && !String(existing.deliveryArea || "").trim()) {
    const match = findCustomerMatch(existing.company || existing.customer || "");
    if (match) updates.deliveryArea = match.areaLabel;
  }

  // Hand the order we already loaded to updateOrder, so the Operations email
  // doesn't re-read the whole ORDER_DETAIL sheet to build itself.
  //
  // The overlay is essential, not tidiness: `existing` was read BEFORE the
  // new values were written, so passing it unchanged would make the email
  // say "Delivery Date: -" and "Delivery Area: -" — precisely the two facts
  // Operations needs. updateOrder never touches the items array, and that
  // array is the expensive part, so reusing it is always safe.
  const result = updateOrder(ref, updates, existing ? Object.assign({}, existing, updates) : null);
  const parsedResult = JSON.parse(result.getContent());
  if (parsedResult.success) {
    if (updates.deliveryArea) parsedResult.deliveryArea = updates.deliveryArea;
    if (warnings.length) parsedResult.warning = warnings.join(" ");
  }
  return jsonResponse(parsedResult);
}

function updateOrder(orderRef, updates, prefetchedOrder) {
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
    status: 7,
    deliveryArea: DELIVERY_AREA_COLUMN
  };

  Object.keys(updates).forEach(key => {
    const col = updateMap[key];
    if (col) {
      header.getRange(foundRow, col).setValue(updates[key]);
    }
  });

  // Auto-notify Operations the instant an order becomes Confirmed, so
  // staff never have to remember a separate "tell OP" step. If it fails
  // for any reason (OP_EMAIL not set up yet, a quota hiccup, etc.) the
  // order simply stays on the "Awaiting Operations" checklist — nothing
  // is lost, a human just has to send it manually that one time.
  let opNotify = null;
  if (String(updates.status || "").toLowerCase() === "confirmed") {
    const alreadySent = header.getRange(foundRow, OP_SENT_COLUMN).getValue();
    if (!alreadySent) {
      opNotify = notifyOperationsOfOrder(orderRef, prefetchedOrder);
      if (opNotify && opNotify.sent) {
        header.getRange(foundRow, OP_SENT_COLUMN).setValue(new Date());
      }
    }
  }

  return jsonResponse({
    success: true,
    orderRef: orderRef,
    status: updates.status || "Updated",
    opNotify: opNotify
  });
}

/*****************************************************
 * NOTIFY OPERATIONS BY EMAIL
 *
 * SETUP: add one more Script Property (same place as SPREADSHEET_ID and
 * STAFF_TOKEN):
 *
 *      Property   Value
 *      --------   --------------------------------------------------
 *      OP_EMAIL   pastryworld.sales@pastryworld.my  (or several,
 *                 comma-separated, if more than one person should get it)
 *
 * If OP_EMAIL is left blank, this quietly does nothing (returns
 * sent:false) — orders just rely on the manual "Copy & mark sent" button
 * instead, exactly like before this feature existed.
 *****************************************************/
/**
 * Pulls {day, month, weekday} out of a delivery date, whether it's stored
 * as a "YYYY-MM-DD" string (the normal case for every order placed through
 * the site) or as a real Date (older/manually-entered rows sometimes are).
 * Returns null if the value can't be parsed as a date at all.
 */
function parseDeliveryDateParts(value) {
  let d;
  if (value instanceof Date) {
    d = value;
  } else {
    const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  if (isNaN(d.getTime())) return null;
  const iso = d.getDay() === 0 ? 7 : d.getDay();
  return { day: d.getDate(), month: d.getMonth() + 1, weekday: WEEKDAY_ISO_NAMES[iso - 1] };
}

/**
 * Matches the subject line staff already write by hand for Operations —
 * e.g. "New order SADA Solutions deliver 14/9 Monday" — so the automatic
 * email looks like one of your own, not a system-generated one.
 * Falls back to a plain "New order <company> — <ref>" if the delivery
 * date can't be parsed for some reason (never blocks sending the email).
 */
function buildOpEmailSubject(order) {
  const who = order.company || order.customer || "Customer";
  const parts = parseDeliveryDateParts(order.deliveryDate);
  if (!parts) return `New order ${who} — ${order.orderRef}`;
  return `New order ${who} deliver ${parts.day}/${parts.month} ${parts.weekday}`;
}

/*****************************************************
 * ALERT SALES OF A BRAND-NEW ORDER
 *
 * SETUP: add a Script Property named SALES_EMAIL with your own email
 * address (see the setup notes at the top of this file). If it's left
 * blank, this quietly does nothing — you'd just check the dashboard
 * yourself instead, exactly like before this feature existed.
 *
 * This fires the moment a customer submits an order (while it's still a
 * "Draft"), which is different from notifyOperationsOfOrder() below —
 * that one fires later, once YOU confirm the order.
 *****************************************************/
/*****************************************************
 * SENDING THE EMAIL
 *
 * By default Google sends these alerts from the Gmail account that owns
 * this script, which looks unprofessional next to a company address. Set
 * the SEND_AS script property to your work address (e.g.
 * difeng.soon@pastryworld.my) and they'll go out from that instead.
 *
 * Google will only do this for an address you have PROVEN you own, by
 * adding it in Gmail: Settings > See all settings > Accounts and Import >
 * "Send mail as" > Add another email address, then entering the code
 * Google emails to that address. Until that's done, Google simply refuses.
 *
 * So SEND_AS is treated as a preference, never a requirement: if the
 * address isn't verified yet we log why and still send the alert from the
 * default account. A missed order email is far worse than one sent from
 * the wrong address.
 *****************************************************/
function configuredSendAsAlias() {
  const wanted = String(scriptProps().getProperty("SEND_AS") || "").trim();
  if (!wanted) return "";
  let aliases = [];
  try {
    aliases = GmailApp.getAliases() || [];
  } catch (err) {
    Logger.log("Couldn't read your Gmail 'Send mail as' addresses (%s) — sending from the default account.", err);
    return "";
  }
  const verified = aliases.filter(a => String(a).toLowerCase() === wanted.toLowerCase())[0];
  if (!verified) {
    Logger.log(
      "SEND_AS is set to %s but that address isn't verified in Gmail yet, so Google won't send as it. "
      + "Add it under Gmail > Settings > Accounts and Import > 'Send mail as'. Verified addresses right now: %s. "
      + "Sending from the default account in the meantime.",
      wanted, aliases.length ? aliases.join(", ") : "(none)"
    );
    return "";
  }
  return verified;
}

/**
 * One place every alert goes out through, so the From address, the sender
 * name and the reply-to address stay consistent across all of them.
 */
/*****************************************************
 * THE EMAIL QUEUE  (for Power Automate)
 *
 * Google can only send these alerts from the Gmail account that owns this
 * script, and Pastry World's mail system treats mail from Google as
 * suspicious — every alert was landing in Junk, including the ones meant
 * for Operations. Sending as the work address through Google doesn't fix
 * that; it makes it worse, because then Google is impersonating the
 * company's own domain.
 *
 * So instead of sending the email, this writes it as a row in an
 * EMAIL_QUEUE tab. A Power Automate flow (included with Microsoft 365 —
 * no extra licence, the Google Sheets connector is a Standard one) watches
 * that tab and sends each row from the real Outlook account. The mail then
 * travels Microsoft-to-Microsoft, properly authenticated, and lands in the
 * inbox instead of Junk — for Operations as well.
 *
 * Turn it on with a script property:  EMAIL_VIA_QUEUE = yes
 * Leave it unset and everything behaves exactly as before, sending
 * straight from Gmail.
 *****************************************************/
const SHEET_EMAIL_QUEUE = "EMAIL_QUEUE";
const EMAIL_QUEUE_COLUMNS = ["Queued At", "To", "Subject", "Body", "Body HTML", "Order Ref", "Kind", "Status"];

function getEmailQueueSheet() {
  return getSheetOrCreate(SHEET_EMAIL_QUEUE, EMAIL_QUEUE_COLUMNS);
}

function emailQueueEnabled() {
  return String(scriptProps().getProperty("EMAIL_VIA_QUEUE") || "").trim().toLowerCase() === "yes";
}

/** Plain text -> HTML, so the mail keeps its line breaks whichever body Power Automate is pointed at. */
function emailBodyAsHtml(body) {
  return String(body || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\r\n|\r|\n/g, "<br>");
}

function queueSystemEmail(to, subject, body, meta) {
  const info = meta || {};
  getEmailQueueSheet().appendRow([
    new Date(), to, subject, body, emailBodyAsHtml(body),
    info.orderRef || "", info.kind || "", "Pending"
  ]);
  return "queued for Power Automate";
}

/**
 * How many queued emails Power Automate hasn't picked up yet, and how old
 * the oldest one is. If this keeps growing, the flow isn't running — which
 * would otherwise be invisible, since queueing always "succeeds".
 */
function pendingEmailSummary() {
  const sheet = getEmailQueueSheet();
  const rows = getDataRows(sheet, EMAIL_QUEUE_COLUMNS);
  const pending = rows.filter(r => String(r[7] || "").trim().toLowerCase() !== "sent");
  if (!pending.length) return { count: 0, oldestMinutes: 0 };
  const oldest = pending.reduce((min, r) => {
    const t = r[0] instanceof Date ? r[0].getTime() : new Date(r[0]).getTime();
    return isNaN(t) ? min : Math.min(min, t);
  }, Date.now());
  return { count: pending.length, oldestMinutes: Math.round((Date.now() - oldest) / 60000) };
}

function sendSystemEmail(to, subject, body, meta) {
  // When the queue is on, writing the row IS the send — Power Automate
  // does the rest. Nothing is sent from Gmail, so nothing is duplicated.
  if (emailQueueEnabled()) {
    return queueSystemEmail(to, subject, body, meta);
  }

  const alias = configuredSendAsAlias();
  const options = { name: "PWDF Order System" };

  // Reply-To is set from SEND_AS whether or not Google will send AS that
  // address. It costs nothing, needs no verification, and means a reply
  // lands in the work inbox rather than the Gmail account — which is most
  // of what people actually want from a "company" sender anyway.
  const preferredAddress = String(scriptProps().getProperty("SEND_AS") || "").trim();
  if (preferredAddress) options.replyTo = preferredAddress;

  if (alias) options.from = alias;
  // GmailApp is what supports sending as a verified alias; MailApp cannot.
  // Without an alias the two behave the same, so we only reach for GmailApp
  // when there's something to gain.
  if (alias) {
    GmailApp.sendEmail(to, subject, body, options);
  } else {
    MailApp.sendEmail(Object.assign({ to: to, subject: subject, body: body }, options));
  }
  return alias || "default account";
}

/**
 * Sends a test email to whatever SALES_EMAIL is set to, right now.
 *
 * Pick "testEmailNow" in the function dropdown at the top of the editor and
 * click Run. If Google has never been given permission to send email from
 * this script it will ask for it the first time — click through and Allow;
 * that alone fixes the commonest cause of "no email arrives". Then open
 * "Execution log" to see whether it sent, and check the junk folder too.
 */
/**
 * SETTING UP POWER AUTOMATE — run this one FIRST.
 *
 * Creates the EMAIL_QUEUE tab if it isn't there yet and drops a single
 * test email into it, WITHOUT switching your live alerts over. Real
 * alerts keep going out the old way until you add the EMAIL_VIA_QUEUE
 * script property, so you are never left without them while setting up.
 *
 * You need this because Power Automate can't be pointed at a worksheet
 * that doesn't exist yet, and you want a row sitting in it to test the
 * flow against before any real order depends on it.
 *
 * Order of play:
 *   1. Run this function.            -> EMAIL_QUEUE tab + one Pending row
 *   2. Build the flow in Power Automate, point it at that tab, test it.
 *   3. Test email arrives from Outlook? Then set EMAIL_VIA_QUEUE = yes.
 */
function testEmailViaQueue() {
  const salesEmail = String(scriptProps().getProperty("SALES_EMAIL") || "").trim();
  const opEmail = String(scriptProps().getProperty("OP_EMAIL") || "").trim();
  const to = salesEmail || opEmail;
  if (!to) {
    Logger.log("Neither SALES_EMAIL nor OP_EMAIL is set — add one in Project Settings > Script Properties first.");
    return;
  }

  queueSystemEmail(
    to,
    "PWDF queue test — please ignore",
    "This email was written into the EMAIL_QUEUE tab of your order sheet, not sent by Google.\n\n"
      + "If it reached you from your own work address, Power Automate is working and you can switch\n"
      + "the order system over by adding the script property EMAIL_VIA_QUEUE = yes.\n\n"
      + "Queued at: " + new Date(),
    { kind: "Test" }
  );

  const queue = pendingEmailSummary();
  Logger.log("Done. The EMAIL_QUEUE tab now exists and holds a test email addressed to %s.", to);
  Logger.log("Emails waiting in the queue: %s", queue.count);
  Logger.log("");
  Logger.log("NOTHING has changed about your live alerts — they still send the old way until you");
  Logger.log("add the script property EMAIL_VIA_QUEUE with the value: yes");
  Logger.log("");
  Logger.log("Next: in Power Automate build a flow with the Google Sheets trigger");
  Logger.log("'When a new row is added', pointed at this spreadsheet's EMAIL_QUEUE worksheet,");
  Logger.log("then an Office 365 Outlook 'Send an email (V2)' step using the To, Subject and");
  Logger.log("Body HTML columns. Run the flow's test and check whether this email arrives.");
}

function testEmailNow() {
  const salesEmail = String(scriptProps().getProperty("SALES_EMAIL") || "").trim();
  const opEmail = String(scriptProps().getProperty("OP_EMAIL") || "").trim();
  const to = salesEmail || opEmail;
  if (!to) {
    Logger.log("Neither SALES_EMAIL nor OP_EMAIL is set — add one in Project Settings > Script Properties first.");
    return;
  }
  Logger.log("Emails left in today's Google quota: %s", MailApp.getRemainingDailyQuota());
  Logger.log("Sending a test email to: %s", to);
  try {
    const sentFrom = sendSystemEmail(
      to,
      "PWDF test email — please ignore",
      "If you can read this, your order system is able to send email successfully.\n\n"
        + "Sent at: " + new Date() + "\n\n"
        + "If this arrived but your new-order alerts didn't, the orders were most likely placed\n"
        + "while you were logged into Staff Mode — the system treats those as your own orders\n"
        + "and doesn't email you about them. Place a test order in a private/incognito window.",
      { kind: "Test" }
    );
    if (emailQueueEnabled()) {
      Logger.log("QUEUED OK for %s — it is now a 'Pending' row in the EMAIL_QUEUE tab.", to);
      Logger.log("Power Automate should pick it up within about 5-15 minutes and send it from Outlook.");
      Logger.log("If nothing arrives, check the flow's run history in Power Automate.");
    } else {
      Logger.log("SENT OK, from: %s", sentFrom);
      Logger.log("Check the inbox AND the junk/spam folder for %s", to);
    }
  } catch (err) {
    Logger.log("FAILED to send: %s", err);
  }
}

function notifySalesOfNewOrder(orderRef) {
  const salesEmail = String(scriptProps().getProperty("SALES_EMAIL") || "").trim();
  if (!salesEmail) return { sent: false, reason: "SALES_EMAIL not configured" };

  const order = fetchOrder(orderRef);
  if (!order) return { sent: false, reason: "order not found" };

  const who = order.company || order.customer || "A customer";
  const subject = `New order received — ${who} (${order.orderRef})`;
  let body = `${who} just placed a new order on your website.\n\nOrder Ref: ${order.orderRef}\nCustomer: ${order.customer || "-"}\nCompany: ${order.company || "-"}\nContact: ${order.contact || "-"}\n`;

  // Customers aren't asked for a delivery date any more, so a brand new
  // order almost always arrives without one. Say what to do about it rather
  // than printing an empty field.
  if (order.deliveryDate) {
    body += `Delivery Date: ${order.deliveryDate}\n`;
  }
  if (order.deliveryArea) {
    body += `Delivery Area: ${order.deliveryArea}\n`;
  }

  // The area hint from BC_CUSTOMERS, so the delivery day is decidable
  // straight from the email without opening anything.
  const hint = order.deliveryArea ? null : findCustomerMatch(order.company || order.customer || "");
  if (hint) {
    const hintArea = getAreaById(hint.areaId);
    const days = hintArea ? areaDeliveryWeekdays(hintArea).map(isoWeekdayName).join(", ") : "";
    body += `Usual delivery area: ${hint.areaLabel}${days ? " (delivers " + days + ")" : ""}\n`;
  } else if (!order.deliveryArea) {
    body += `Usual delivery area: not on file — this may be a new customer.\n`;
  }

  if (isUnlistedAreaOrder(order)) {
    body += `\n⚠ This customer's area was NOT in our delivery schedule — please confirm the exact delivery day with them directly.\n`;
  }
  body += `\nITEMS:\n`;
  (order.items || []).forEach(item => {
    body += `${item.qty || 0} x ${item.name || item.code || "-"}${item.remark ? " (" + item.remark + ")" : ""}\n`;
  });
  body += `\nNEXT STEP: open your dashboard and set the delivery date for this order. `
    + `Setting the date confirms it and sends it to Operations in one go. `
    + `Until then it stays a DRAFT and Operations knows nothing about it.`;

  try {
    return { sent: true, from: sendSystemEmail(salesEmail, subject, body, { orderRef: order.orderRef, kind: "New order" }) };
  } catch (err) {
    Logger.log("Sales new-order email FAILED: %s", err);
    return { sent: false, reason: String(err) };
  }
}

/**
 * `prefetchedOrder` lets a caller that has already loaded the order hand it
 * over instead of making this re-read it. fetchOrder scans the whole
 * ORDER_DETAIL sheet — every line of every order ever placed — so doing
 * that twice for one click is the most expensive thing in the request.
 */
function notifyOperationsOfOrder(orderRef, prefetchedOrder) {
  const opEmail = String(scriptProps().getProperty("OP_EMAIL") || "").trim();
  if (!opEmail) return { sent: false, reason: "OP_EMAIL not configured" };

  const order = prefetchedOrder || fetchOrder(orderRef);
  if (!order) return { sent: false, reason: "order not found" };

  const subject = buildOpEmailSubject(order);
  let body = `ORDER FOR OPERATIONS\n\nOrder Ref: ${order.orderRef}\nCustomer: ${order.customer || "-"}\nCompany: ${order.company || "-"}\nContact: ${order.contact || "-"}\nDelivery Date: ${order.deliveryDate || "-"}\nDelivery Area: ${order.deliveryArea || "-"}\n`;
  if (isUnlistedAreaOrder(order)) {
    body += `\n⚠ This customer's area was NOT in our delivery schedule — please confirm the exact delivery day with them directly before dispatch.\n`;
  }
  body += `\nITEMS:\n`;
  (order.items || []).forEach(item => {
    body += `${item.qty || 0} x ${item.name || item.code || "-"}${item.remark ? " (" + item.remark + ")" : ""}\n`;
  });
  body += `\n(Confirmed by Sales — please proceed with preparation.)`;

  try {
    return { sent: true, from: sendSystemEmail(opEmail, subject, body, { orderRef: order.orderRef, kind: "To Operations" }) };
  } catch (err) {
    Logger.log("Operations email FAILED: %s", err);
    return { sent: false, reason: String(err) };
  }
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
    opSentDate: row[8] ? formatSheetDate(row[8]) : "",
    sentToOp: !!row[8],
    deliveryArea: row[9] || "",
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
      itemCount: row[7],
      opSentDate: row[8] ? formatSheetDate(row[8]) : "",
      sentToOp: !!row[8],
      deliveryArea: row[9] || ""
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
    opSentDate: orderRow[8] ? formatSheetDate(orderRow[8]) : "",
    sentToOp: !!orderRow[8],
    deliveryArea: orderRow[9] || "",
    items: items
  };
}

/*****************************************************
 * FETCH DRAFT ORDERS  (staff only — enforced in doGet)
 *****************************************************/
/**
 * Turns one ORDER_HEADER row into an order object, remembering which row of
 * the sheet it came from so ties can be broken by "further down = newer".
 */
function orderFromHeaderRow(row, index) {
  return {
    orderRef: row[0],
    customer: row[1],
    company: row[2],
    contact: row[3],
    createdDate: row[4],
    deliveryDate: row[5],
    status: row[6],
    itemCount: row[7],
    opSentDate: row[8] ? formatSheetDate(row[8]) : "",
    sentToOp: !!row[8],
    deliveryArea: row[9] || "",
    _sheetRow: index
  };
}

function orderCreatedTime(order) {
  const raw = order && order.createdDate;
  if (raw instanceof Date) return raw.getTime();
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

/**
 * Newest first, then drop the internal sort key.
 *
 * A sales dashboard is read from the top, so an order that just came in has
 * to be the first thing on the page. Straight sheet order buries it at the
 * bottom of a list that only ever grows — which looks exactly like the order
 * never arrived at all, even though it saved perfectly.
 */
function sortOrdersNewestFirst(orders) {
  orders.sort((a, b) => (orderCreatedTime(b) - orderCreatedTime(a)) || (b._sheetRow - a._sheetRow));
  orders.forEach(order => { delete order._sheetRow; });
  return orders;
}

function fetchDraftOrders() {
  const header = getHeaderSheet();
  const rows = getDataRows(header, HEADER_COLUMNS);

  return sortOrdersNewestFirst(
    rows
      .map(orderFromHeaderRow)
      .filter(order => String(order.status || "").toLowerCase() === "draft")
  );
}

/*****************************************************
 * ORDERS AWAITING OPERATIONS  (staff only — enforced in doGet)
 *
 * A "Confirmed" order (sales has agreed it with the customer) that has no
 * OpSentDate yet means nobody has told the kitchen/Operations team about it.
 * This is the checklist that stops an order silently falling through the
 * cracks between "confirmed with customer" and "actually being made".
 *****************************************************/
function getOrdersNeedingOp() {
  const header = getHeaderSheet();
  const rows = getDataRows(header, HEADER_COLUMNS);

  return sortOrdersNewestFirst(
    rows
      .map(orderFromHeaderRow)
      .filter(order => String(order.status || "").toLowerCase() === "confirmed" && !order.sentToOp)
  );
}

/*****************************************************
 * MARK / UNMARK SENT TO OPERATIONS  (staff only — enforced in doPost)
 *****************************************************/
function markSentToOp(orderRef, sent) {
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
    return { success: false, error: "Order not found" };
  }

  const value = sent ? new Date() : "";
  header.getRange(foundRow, OP_SENT_COLUMN).setValue(value);

  return {
    success: true,
    orderRef: orderRef,
    sentToOp: !!sent,
    opSentDate: sent ? formatSheetDate(value) : ""
  };
}

/*****************************************************
 * ONE-TIME CLEANUP — run this once, manually, from the Apps Script editor
 * after adding this feature.
 *
 * Every order that was already "Confirmed" before this feature existed has
 * a blank OpSentDate (the column didn't exist yet), so it would otherwise
 * flood your new "Awaiting Operations" checklist with old orders you likely
 * already told Operations about by hand. This backfills those old rows so
 * only NEW confirmations show up on the checklist going forward.
 *
 * Safe to run more than once — it only ever fills in blanks, never
 * overwrites a real OpSentDate.
 *****************************************************/
function backfillOpSentForExistingConfirmedOrders() {
  const header = getHeaderSheet();
  const values = header.getDataRange().getValues();
  let updated = 0;

  for (let i = 1; i < values.length; i++) {
    const status = String(values[i][6] || "").toLowerCase();
    const alreadySent = values[i][8];
    if (status === "confirmed" && !alreadySent) {
      header.getRange(i + 1, OP_SENT_COLUMN).setValue(values[i][4] || new Date());
      updated++;
    }
  }

  Logger.log("Backfilled OpSentDate for %s existing confirmed order(s).", updated);
  return updated;
}

/*****************************************************
 * ONE-TIME SETUP — run this once, manually, from the Apps Script editor,
 * after pasting your Business Central customer export into the
 * BC_CUSTOMERS sheet's "Company Name" column. This sheet is separate from
 * any general leads/WhatsApp-contacts sheet you may already keep — running
 * this creates BC_CUSTOMERS fresh if it doesn't exist yet, and never
 * touches any other tab.
 *
 * Locks the "Delivery Area" column (column B) to a dropdown of every valid
 * area label, so filling in each customer's area is a click, not free
 * typing — no typos, and it can never drift out of sync with the areas the
 * order form actually offers. Safe to run again any time (e.g. after this
 * feature adds more areas later) — it just refreshes the dropdown list.
 *****************************************************/
function setupCustomersAreaDropdown() {
  const sheet = getCustomersSheet();
  const labels = getAllAreaLabels();
  const lastRow = Math.max(sheet.getLastRow(), 500); // room to paste in bulk
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(labels, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 2, lastRow - 1, 1).setDataValidation(rule);
  Logger.log("Delivery Area dropdown set on %s!B2:B%s with %s area choices.", SHEET_CUSTOMERS, lastRow, labels.length);
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

/*****************************************************
 * PRODUCT CACHE
 *
 * Every customer opening the order page used to make this script reopen
 * the spreadsheet and re-read all ~341 product rows. That single request
 * was the entire wait before the menu appeared. The catalogue changes a
 * few times a week at most, so re-reading it for every visitor is pure
 * waste.
 *
 * Two rules this cache is built around:
 *
 * 1. WHAT IS CACHED IS THE ALREADY-FILTERED ANSWER, never the raw sheet
 *    rows. Raw rows carry wholesale prices. By caching the output of
 *    getProducts(isStaff) instead, the public cache entry structurally
 *    cannot contain a price — so even a key mix-up leaks nothing.
 *    Staff and public therefore get separate keys.
 *
 * 2. A CACHE FAILURE MUST NEVER BE AN OUTAGE. Every read and write is
 *    wrapped; anything unexpected falls through to reading the sheet
 *    exactly as before.
 *
 * Values are gzipped because CacheService caps a value at 100KB and the
 * catalogue is ~62KB of very repetitive JSON, which compresses to
 * roughly a quarter of that. Deliberately NOT split across several keys:
 * Apps Script can evict keys independently, so a chunked value can come
 * back half-missing and reassemble into corrupt JSON.
 *****************************************************/
const PRODUCT_CACHE_VERSION = "v1";
const PRODUCT_CACHE_TTL_SECONDS = 600;   // catalogue: names, categories, options
const PRICES_CACHE_TTL_SECONDS = 120;    // prices: shorter, money deserves it
const CACHE_MAX_VALUE_BYTES = 95000;     // CacheService hard limit is 100KB
const PRICES_CACHE_KEY = "pwdf.prices." + PRODUCT_CACHE_VERSION;

function productsCacheKey(isStaffRequest) {
  return "pwdf.products." + (isStaffRequest ? "staff" : "public") + "." + PRODUCT_CACHE_VERSION;
}

function cacheGetJson(key) {
  try {
    const raw = CacheService.getScriptCache().get(key);
    if (!raw) return null;
    const gz = Utilities.newBlob(Utilities.base64Decode(raw), "application/x-gzip");
    return JSON.parse(Utilities.ungzip(gz).getDataAsString("UTF-8"));
  } catch (err) {
    Logger.log("Cache read failed for %s (ignored, reading live): %s", key, err);
    return null;
  }
}

function cachePutJson(key, value, ttlSeconds) {
  try {
    const encoded = Utilities.base64Encode(
      Utilities.gzip(Utilities.newBlob(JSON.stringify(value), "application/json")).getBytes()
    );
    if (encoded.length > CACHE_MAX_VALUE_BYTES) {
      // Too big to cache — serve live rather than throw. This only happens
      // if the catalogue grows several times over, and it degrades to the
      // old behaviour rather than breaking.
      Logger.log("Cache skipped for %s: %s bytes compressed, over the limit.", key, encoded.length);
      return;
    }
    CacheService.getScriptCache().put(key, encoded, ttlSeconds);
  } catch (err) {
    Logger.log("Cache write failed for %s (ignored): %s", key, err);
  }
}

function getProductsCached(isStaffRequest) {
  const key = productsCacheKey(isStaffRequest);
  const hit = cacheGetJson(key);
  if (hit && Array.isArray(hit) && hit.length) return hit;
  const fresh = getProducts(isStaffRequest);
  cachePutJson(key, fresh, PRODUCT_CACHE_TTL_SECONDS);
  return fresh;
}

function getWholesalePricesCached() {
  const hit = cacheGetJson(PRICES_CACHE_KEY);
  if (hit && typeof hit === "object") return hit;
  const fresh = getWholesalePrices();
  cachePutJson(PRICES_CACHE_KEY, fresh, PRICES_CACHE_TTL_SECONDS);
  return fresh;
}

/**
 * Called whenever a product is saved, so a price or name change shows up
 * on the customer's menu immediately instead of waiting for the TTL.
 */
function invalidateProductCache() {
  try {
    CacheService.getScriptCache().removeAll([
      productsCacheKey(true), productsCacheKey(false), PRICES_CACHE_KEY
    ]);
  } catch (err) {
    Logger.log("Cache clear failed (ignored): %s", err);
  }
}

/**
 * Run this from the Apps Script editor if you edited the PRODUCTS tab by
 * hand and want the change live right now rather than within 10 minutes.
 */
function clearProductCacheNow() {
  invalidateProductCache();
  Logger.log("Product cache cleared. The next customer to open the page will get fresh data.");
}

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
  var priceMap = getWholesalePricesCached();
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

  // A price or name change should reach the customer's menu straight away,
  // not whenever the cache happens to expire.
  invalidateProductCache();

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
