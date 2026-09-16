function generateOrderRef() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timePart = now.getHours().toString().padStart(2, "0") + now.getMinutes().toString().padStart(2, "0");
  const randomPart = Math.floor(100 + Math.random() * 900);
  return `PWDF-${datePart}-${timePart}-${randomPart}`;
}

/* Turns whatever the page is holding as a cart into the rows the sheet wants.

   Accepts either a Map (what script.js.js's CART is) or a plain Array (what
   the older edit page built), so both pages can share one save path.

   The product code matters: it is what the price lookup and every later
   report key on. A real code is always preferred. The old first-word-of-the-
   name guess is kept only as a last resort for rows that genuinely have no
   code — it is wrong for any product whose name doesn't start with its code. */
function normalizeOrderItems(cart) {
  const list = cart instanceof Map
    ? Array.from(cart.values())
    : (Array.isArray(cart) ? cart : []);

  return list.map(item => {
    const name = item.name || item.item || "";
    const code = String(item.code || "").trim() || name.split(" ")[0];
    return {
      code: code,
      name: name,
      qty: Number(item.qty) || 0,
      remark: `${item.choice || ""} ${item.addon || ""}`.trim(),
      choice: item.choice || "",
      addon: item.addon || "",
      category: item.category || ""
    };
  });
}

function buildOrderPayload({
  orderRef,
  customer,
  company,
  contact,
  deliveryDate,
  status = "Draft",
  notes = "",
  cart = [],
  createdDate,
  updatedDate
}) {
  const now = new Date().toISOString();
  return {
    orderRef: orderRef || generateOrderRef(),
    customer: customer || "",
    company: company || "",
    contact: contact || "",
    deliveryDate: deliveryDate || "",
    status,
    orderJson: JSON.stringify(normalizeOrderItems(cart)),
    notes: notes || "",
    createdDate: createdDate || now,
    updatedDate: updatedDate || now,
    items: normalizeOrderItems(cart)
  };
}

async function saveOrderPayload(orderPayload) {
  const body = orderPayload && orderPayload.action === "saveOrder" && orderPayload.order
    ? orderPayload.order
    : orderPayload;
  return await postToGoogleApi(body);
}

async function updateOrderPayload(orderRef, updates) {
  return await postToGoogleApi({
    action: "updateOrder",
    orderRef,
    updates
  });
}

/* Setting the delivery date is the single action that also confirms the
   order and emails Operations — see setdeliverydate in the backend. */
async function setDeliveryDate(orderRef, deliveryDate) {
  return await postToGoogleApi({
    action: "setdeliverydate",
    orderRef,
    deliveryDate
  });
}

/* Which area this customer is usually delivered to, and the next few dates
   that area is actually served on. Staff-only. */
async function fetchDeliveryHint(company) {
  return await getFromGoogleApi({
    action: "getdeliveryhint",
    company: company || ""
  });
}

async function fetchOrder(orderRef) {
  const result = await getFromGoogleApi({
    action: "getorder",
    orderRef
  });
  if (!result || result.success === false) return null;
  if (!result.orderRef && !result.OrderRef) return null;
  return result;
}

async function searchOrders(query) {
  const result = await getFromGoogleApi({
    action: "searchorders",
    query: query || ""
  });
  if (Array.isArray(result)) return result;
  return {
    error: result && result.message ? result.message : "Search failed",
    payload: result
  };
}

async function getOrdersByDate(date) {
  if (!date) return [];
  // date expected in yyyy-MM-dd (input[type=date] gives yyyy-MM-dd)
  const result = await getFromGoogleApi({
    action: "getordersbydate",
    date: date
  });
  return Array.isArray(result) ? result : [];
}

async function fetchDraftOrders() {
  return await getFromGoogleApi({
    action: "getdraftorders"
  });
}

/* Confirmed orders that haven't been marked as sent to Operations yet —
   the checklist that stops an order from being forgotten between "sales
   confirmed it with the customer" and "the kitchen actually knows about it". */
async function fetchOrdersNeedingOp() {
  return await getFromGoogleApi({
    action: "getneedop"
  });
}

/* sent=true marks an order as sent to Operations (recording the moment);
   sent=false undoes that, in case it was clicked by mistake. */
async function sendOrderToOp(orderRef, sent = true) {
  return await postToGoogleApi({
    action: "sendtoop",
    orderRef,
    sent
  });
}
